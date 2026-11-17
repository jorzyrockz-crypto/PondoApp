'use strict';
// Isolated, read-only backup prototype. Not an app export or a restore API.
// The caller must be a verified server principal with a current owner role.
const {createHash}=require('node:crypto');
const {facultyCashLedger}=require('./faculty-fund-ledger.cjs');
function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 throw Error('Unsupported backup value');
}
function checksum(payload){return createHash('sha256').update(canonical(payload),'utf8').digest('hex');}
function verifyFacultyBackup(envelope){
 try{return envelope?.format==='pondo-faculty-fund-backup-v1'&&typeof envelope.checksum==='string'&&/^[a-f0-9]{64}$/.test(envelope.checksum)&&checksum(envelope.payload)===envelope.checksum}catch{return false}
}
function createFacultyFundBackupService({db,clock=()=>new Date()}){
 if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function')throw Error('A server Firestore instance is required');
 return async ({auth,orgId})=>{
  if(!auth?.uid||typeof auth.uid!=='string'||auth.uid.includes('/')||auth.uid.length>128)throw Error('Verified owner authentication required');
  if(typeof orgId!=='string'||!orgId||orgId.length>160||orgId.includes('/')||orgId==='.'||orgId==='..')throw Error('Invalid workspace ID');
  const uid=auth.uid,root=`organizations/${orgId}`;
  return db.runTransaction(async tx=>{
   const [member,config,state]=await Promise.all([tx.get(db.doc(`${root}/members/${uid}`)),tx.get(db.doc(`${root}/facultyFund/config`)),tx.get(db.doc(`${root}/facultyFund/state`))]);
   if(!member.exists||member.data().uid!==uid||member.data().role!=='owner')throw Error('Only a current workspace owner can export');
   if(!state.exists)throw Error('No Faculty Fund records to export');
   const now=clock();if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Server clock unavailable');
   // A backup must remain available for recovery even if state is inconsistent.
   // This is an advisory check, not complete integrity validation.
   let ledgerCheck='passed';try{facultyCashLedger(state.data())}catch{ledgerCheck='failed'}
   const payload={workspaceId:orgId,exportedAt:now.toISOString(),exportedByUid:uid,ledgerCheck,config:config.exists?config.data():null,state:state.data()};
   return {format:'pondo-faculty-fund-backup-v1',payload,checksum:checksum(payload)};
  });
 };
}
module.exports={createFacultyFundBackupService,verifyFacultyBackup};
