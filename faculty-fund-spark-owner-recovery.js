/* Experimental owner workflow. Not wired to production. The downloaded file
 * requires matching immutable server copies; it is not a standalone restore. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)},valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(x);
 function createOwnerRecovery({getContext,storage,randomId,exportDiagnostic,capture,restore,getLock,makeFile,inspectFile,fileDeps}){
  if(!storage||[getContext,randomId,exportDiagnostic,capture,restore,getLock,makeFile,inspectFile].some(x=>typeof x!=='function')||!fileDeps)fail('Owner recovery is unavailable');
  function context(orgId){const c=getContext();if(!c||c.memberConfirmed!==true||c.role!=='owner'||!c.uid||typeof orgId!=='string'||!orgId||orgId.includes('/')||c.orgId!==orgId||!['string','number'].includes(typeof c.scopeToken))fail('A confirmed workspace owner is required');return {...c};}
  function current(c){const n=getContext();return !!n&&n.memberConfirmed===true&&n.role==='owner'&&n.uid===c.uid&&n.orgId===c.orgId&&n.scopeToken===c.scopeToken;}
  function guard(c){if(!current(c))fail('Workspace changed during recovery');}
  function key(c,kind){return 'faculty-owner-recovery-v1:'+kind+':'+encodeURIComponent(c.uid)+':'+encodeURIComponent(c.orgId);}
  function get(c,kind){try{const text=storage.getItem(key(c,kind));if(text===null)return null;const data=JSON.parse(text);if(!data||!valid(data.id)||kind==='restore'&&!valid(data.backupId))fail('Invalid saved recovery token');return data;}catch(e){fail('Recovery token storage is unavailable or invalid');}}
  function save(c,kind,value){try{const text=JSON.stringify(value);storage.setItem(key(c,kind),text);if(storage.getItem(key(c,kind))!==text)throw Error();}catch{fail('This device cannot safely save a recovery token; no new recovery was started');}}
  function clear(c,kind){try{storage.removeItem(key(c,kind));if(storage.getItem(key(c,kind))!==null)throw Error();}catch{fail('Recovery completed but its retry token could not be cleared');}}
  function fresh(){const id=randomId();if(!valid(id))fail('Secure recovery ID is unavailable');return id;}
  let running=false;async function exclusive(task){if(running)fail('A recovery operation is already running');running=true;try{return await task();}finally{running=false;}}
  async function download({orgId}={}){
   const c=context(orgId);let token=get(c,'capture');if(!token){token={id:fresh()};save(c,'capture',token);}guard(c);
   const diagnostic=await exportDiagnostic({orgId});guard(c);const result=await capture({orgId,backupId:token.id,diagnostic,encode:fileDeps.encode});guard(c);
   const file=await makeFile({...fileDeps,orgId,diagnostic,capture:result});guard(c);if(new TextEncoder().encode(JSON.stringify(file)).length>10*1024*1024)fail('Recovery file exceeds the 10 MB limit; no usable file was created');clear(c,'capture');return file;
  }
  // Abandoning only forgets an unfinished capture token; immutable partial
  // server copies may remain and consume storage. It does not delete records.
  function abandonCapture({orgId}={}){if(running)fail('A recovery operation is already running');const c=context(orgId);guard(c);clear(c,'capture');}
  async function importFile({orgId,content}={}){
   const c=context(orgId);if(typeof content!=='string'||content.length>10*1024*1024||new TextEncoder().encode(content).length>10*1024*1024)fail('Choose a recovery JSON file no larger than 10 MB');let value;try{value=JSON.parse(content)}catch{fail('Choose a valid recovery JSON file')}
   const checked=await inspectFile({...fileDeps,orgId,value});guard(c);let token=get(c,'restore');const active=await getLock({orgId});guard(c);
   if(active){if(active.createdBy!==c.uid||active.backupId!==checked.backupId||!valid(active.sessionId))fail('Another restore is already in progress');if(token&&(token.id!==active.sessionId||token.backupId!==active.backupId))fail('A different restore token is saved on this device');if(!token){token={id:active.sessionId,backupId:active.backupId};save(c,'restore',token);}}
   else if(token&&token.backupId!==checked.backupId)fail('Finish the pending restore before choosing another recovery file');
   if(!token){token={id:fresh(),backupId:checked.backupId};save(c,'restore',token);}guard(c);
   let result;try{result=await restore({orgId,backupId:token.backupId,sessionId:token.id,expected:checked.expected});}catch(error){
    // If another device started the very same owner's restore concurrently,
    // keep the authoritative active session for a deliberate retry. Never
    // replace a token for a different owner or a different backup.
    guard(c);try{const now=await getLock({orgId});guard(c);if(now&&now.createdBy===c.uid&&now.backupId===token.backupId&&valid(now.sessionId)&&now.sessionId!==token.id)save(c,'restore',{id:now.sessionId,backupId:now.backupId});}catch(e){guard(c);}
    throw error;
   }guard(c);clear(c,'restore');return result;
  }
  return {download:input=>exclusive(()=>download(input)),importFile:input=>exclusive(()=>importFile(input)),abandonCapture};
 }
 if(typeof module==='object'&&module.exports)module.exports={createFacultyOwnerRecovery:createOwnerRecovery};else global.createFacultyOwnerRecovery=createOwnerRecovery;
})(typeof window!=='undefined'?window:globalThis);
