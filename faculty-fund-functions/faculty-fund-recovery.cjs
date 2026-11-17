'use strict';
// Recovery logic for the isolated callable codebase; never accept a
// client-uploaded backup as evidence of a President's acceptance. Snapshots
// created here live in a server-only Firestore collection in the same org.
const {createHash}=require('node:crypto');
const {facultyCashLedger}=require('./faculty-fund-ledger.cjs');
const {FacultyFundError}=require('./faculty-fund-service.cjs');
const fail=message=>{throw new FacultyFundError('failed-precondition',message)};
const MAX_STATE_BYTES=450000;
const hash=value=>createHash('sha256').update(value).digest('hex');
function segment(value,label,max=128){if(typeof value!=='string'||!value||value.length>max||value.includes('/')||value==='.'||value==='..')fail('Invalid '+label);return value;}
function token(value){if(typeof value!=='string'||!/^[a-f0-9]{32}$/.test(value))fail('Invalid request ID');return value;}
function revision(snapshot){const v=snapshot.exists?snapshot.data().revision:null;if(!Number.isSafeInteger(v)||v<1||v===Number.MAX_SAFE_INTEGER)fail('Invalid Faculty Fund control revision');return v;}
function checkedLedger(state){try{return facultyCashLedger(state)}catch(e){fail('Faculty Fund state failed cash validation');}}
function currentTime(clock){const d=clock();if(!(d instanceof Date)||!Number.isFinite(d.getTime()))fail('Server clock unavailable');return d.toISOString();}
function createFacultyFundRecoveryService({db,clock=()=>new Date()}){
 if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function')throw Error('A server Firestore instance is required');
 return async ({auth,input})=>{
  const uid=segment(auth?.uid,'user UID'),orgId=segment(input?.orgId,'workspace ID',160),requestId=token(input?.requestId);
  const operation=input?.operation;
  if(!['saveBackup','restoreMissing'].includes(operation))fail('Invalid recovery operation');
  const backupId=operation==='saveBackup'?hash(JSON.stringify([uid,requestId])):input?.backupId;
  if(typeof backupId!=='string'||!/^[a-f0-9]{64}$/.test(backupId))fail('Invalid backup ID');
  const fingerprint=hash(JSON.stringify({operation,...(operation==='restoreMissing'?{backupId}:{})})),opKey=hash(JSON.stringify([uid,requestId]));
  const root=`organizations/${orgId}`,member=db.doc(`${root}/members/${uid}`),stateRef=db.doc(`${root}/facultyFund/state`),configRef=db.doc(`${root}/facultyFund/config`),controlRef=db.doc(`${root}/facultyFund/control`),backupRef=db.doc(`${root}/facultyFundBackups/${backupId}`),opRef=db.doc(`${root}/facultyFundOperations/${opKey}`);
  return db.runTransaction(async tx=>{
   const [m,s,c,control,backup,op]=await Promise.all([tx.get(member),tx.get(stateRef),tx.get(configRef),tx.get(controlRef),tx.get(backupRef),tx.get(opRef)]);
   if(!m.exists||m.data().uid!==uid||m.data().role!=='owner')fail('Only a current workspace owner can perform recovery');
   const rev=revision(control);
   if(op.exists){const previous=op.data();if(previous.uid!==uid||previous.hash!==fingerprint)fail('Request ID already used for a different operation');if(operation==='saveBackup'&&!backup.exists)fail('Saved backup is unavailable');if(operation==='restoreMissing'&&(!s.exists||rev<previous.result.revision))fail('Restored state is unavailable');return {...previous.result,replayed:true};}
   const at=currentTime(clock);let result;
   if(operation==='saveBackup'){
    if(!s.exists)fail('No Faculty Fund state to back up');
    // Refuse inconsistent snapshots as restore points; use the separate
    // diagnostic export if a damaged state must be investigated.
    const state=s.data();checkedLedger(state);
    if(Buffer.byteLength(JSON.stringify(state),'utf8')>MAX_STATE_BYTES)fail('Faculty Fund state is too large');
    if(backup.exists)fail('Backup ID already exists');
    tx.create(backupRef,{workspaceId:orgId,revision:rev,state,config:c.exists?c.data():null,createdAt:at,createdByUid:uid});
    result={ok:true,backupId,revision:rev};
   }else{
    if(s.exists)fail('Live Faculty Fund state exists; refusing to overwrite it');
    if(!backup.exists)fail('Server backup not found');
    const saved=backup.data();
    if(saved.workspaceId!==orgId||saved.revision!==rev)fail('Backup is not the latest verified state; manual recovery required');
    let restored;try{restored=structuredClone(saved.state)}catch(e){fail('Invalid server backup state')}checkedLedger(restored);
    if(!Array.isArray(restored.audit))fail('Invalid backup audit history');
    restored.audit.push({kind:'state-restored-from-backup',id:backupId,actorUid:uid,at,sourceRevision:rev});
    if(Buffer.byteLength(JSON.stringify(restored),'utf8')>MAX_STATE_BYTES)fail('Restored Faculty Fund state is too large');
    tx.create(stateRef,restored);
    // Assignment is NOT restored from old backup. Preserve a current config,
    // or require the owner to assign an existing member again if it is absent.
    tx.set(controlRef,{revision:rev+1,updatedAt:at,updatedByUid:uid});
    result={ok:true,backupId,sourceRevision:rev,revision:rev+1};
   }
   tx.create(opRef,{uid,hash:fingerprint,result,createdAt:at});
   return {...result,replayed:false};
  });
 };
}
module.exports={createFacultyFundRecoveryService};
