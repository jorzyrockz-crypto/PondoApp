'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFacultySparkCapture,planFacultySparkCapture:plan,canonicalFacultySparkCapture:canonical}=require('../faculty-fund-spark-capture.js');
const {createFacultySparkRestore}=require('../faculty-fund-spark-restore.js');
const {projectFacultySpark:project}=require('../faculty-fund-spark-projection.js');
const names={people:'sparkDiscoveryPeople',payments:'sparkDiscoveryPayments',slots:'sparkDiscoveryPaymentSlots',remittances:'sparkDiscoveryRemittances',lines:'sparkDiscoveryLines',wallets:'sparkDiscoveryWallets',expenses:'sparkDiscoveryExpenseDrafts',allocations:'sparkDiscoveryAllocations',corrections:'sparkDiscoveryCorrections',presidentHistory:'sparkDiscoveryPresidentHistory',memberReceipts:'sparkDiscoveryMemberReceipts',remittanceReceipts:'sparkDiscoveryRemittanceReceipts'};
function fixture(){
 const root='organizations/school/',data=new Map([[root+'sparkDiscoveryRevision/current',{revision:5}],[root+'sparkDiscoveryPeople/teacher',{name:'Ana'}]]),db={},context={orgId:'school',uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1};let ctx=context,failAfter=0;
 const read=p=>({exists:()=>data.has(p),data:()=>data.get(p),metadata:{fromCache:false,hasPendingWrites:false}});
 const api={doc:(_db,p)=>p,serverTimestamp:()=>({server:true}),getDocFromServer:async p=>read(p),runTransaction:async(_db,fn)=>{const writes=[],out=await fn({get:async p=>read(p),set:(p,v)=>writes.push(['set',p,v]),update:(p,v)=>writes.push(['update',p,v]),delete:p=>writes.push(['delete',p])});for(const [op,p,v] of writes){if(op==='delete')data.delete(p);else if(op==='set')data.set(p,v);else data.set(p,{...data.get(p),...v});}if(failAfter&&!--failAfter)throw Error('Simulated response loss');return out;}};
 const reader=()=>({read:async()=>{const records=Object.fromEntries(Object.entries(names).map(([name,kind])=>[name,[...data.entries()].filter(([k])=>k.startsWith(root+kind+'/')&&!k.slice((root+kind+'/').length).includes('/')).map(([k,v])=>({...v,id:k.split('/').at(-1)}))]));return {revision:data.get(root+'sparkDiscoveryRevision/current').revision,records,config:data.get(root+'sparkDiscoveryConfig/current')||null,projection:project({confirmed:true,...records})}}});
 const deps={db,api,getContext:()=>ctx,makeReader:reader},capture=createFacultySparkCapture(deps),restore=createFacultySparkRestore({...deps,project,plan,canonical});return {data,root,capture,restore,setContext:v=>ctx=v,context,failOnTransaction:n=>failAfter=n};
}
const input={orgId:'school',backupId:'abcdefghijklmnop',sessionId:'session123456789'};
test('captures, restores a missing record, checks the ledger and completes exactly once',async()=>{
 const f=fixture();await f.capture.capture(input);f.data.delete(f.root+'sparkDiscoveryPeople/teacher');assert.equal((await f.restore.restore(input)).status,'experiment-restored');assert.deepEqual(f.data.get(f.root+'sparkDiscoveryPeople/teacher'),{name:'Ana'});assert.equal(f.data.has(f.root+'sparkRestoreProof/current'),false);assert.equal((await f.restore.restore(input)).status,'experiment-already-restored');
});
test('a lost transaction response resumes with the same session and does not double-count',async()=>{
 const f=fixture();await f.capture.capture(input);f.data.delete(f.root+'sparkDiscoveryPeople/teacher');f.failOnTransaction(2);await assert.rejects(f.restore.restore(input),/response loss/);assert.equal(f.data.get(f.root+'sparkRestoreProof/current').remaining,0);assert.equal((await f.restore.restore(input)).status,'experiment-restored');
});
test('missing copies and stale revision refuse to start, conflicting records are never overwritten',async()=>{
 let f=fixture();await f.capture.capture(input);f.data.delete(f.root+`sparkVerifiedBackups/${input.backupId}/collections/sparkDiscoveryPeople/entries/teacher`);await assert.rejects(f.restore.restore(input),/incomplete/);assert.equal(f.data.has(f.root+'sparkRestoreProof/current'),false);
 f=fixture();await f.capture.capture(input);f.data.set(f.root+'sparkDiscoveryRevision/current',{revision:6});await assert.rejects(f.restore.restore(input),/stale/);assert.equal(f.data.has(f.root+'sparkRestoreProof/current'),false);
 f=fixture();await f.capture.capture(input);f.data.set(f.root+'sparkDiscoveryPeople/teacher',{name:'Other'});await assert.rejects(f.restore.restore(input),/differs/);assert.deepEqual(f.data.get(f.root+'sparkDiscoveryPeople/teacher'),{name:'Other'});assert.ok(f.data.has(f.root+'sparkRestoreProof/current'));
});
test('rejects malformed manifests, nonowners, scope changes and competing sessions',async()=>{
 const f=fixture();await f.capture.capture(input);f.setContext({...f.context,role:'reviewer'});await assert.rejects(f.restore.restore(input),/owner/);f.setContext(f.context);
 const header=f.root+'sparkVerifiedBackups/'+input.backupId,original=f.data.get(header);f.data.set(header,{...original,manifest:['../unsafe']});await assert.rejects(f.restore.restore(input),/manifest/);f.data.set(header,original);
 f.data.set(f.root+'sparkRestoreProof/current',{backupId:input.backupId,sessionId:'other12345678900',revision:5,createdBy:'owner',remaining:1});await assert.rejects(f.restore.restore(input),/Another restore/);
});
