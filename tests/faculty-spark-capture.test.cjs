'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFacultySparkCapture,planFacultySparkCapture}=require('../faculty-fund-spark-capture.js');
const names=['people','payments','slots','remittances','lines','wallets','expenses','allocations','corrections','presidentHistory','memberReceipts','remittanceReceipts'];
const snapshot=()=>({revision:5,config:{presidentUid:'p'},projection:{balanceCents:100},records:Object.fromEntries(names.map(x=>[x,[]]))});
function fixture(){
 let context={orgId:'school',uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1},after=()=>{};const root='organizations/school/',db={},data=new Map([[root+'sparkDiscoveryRevision/current',{revision:5}],[root+'sparkDiscoveryConfig/current',{presidentUid:'p'}],[root+'sparkDiscoveryPayments/p',{amountCents:100,acceptedBy:'president'}]]),snap=snapshot();snap.records.payments.push({id:'p',amountCents:100,acceptedBy:'president'});
 const doc=(_db,p)=>p,read=p=>({exists:()=>data.has(p),data:()=>data.get(p),metadata:{fromCache:false,hasPendingWrites:false}});
 const api={doc,serverTimestamp:()=>({server:true}),getDocFromServer:async p=>read(p),runTransaction:async(_db,fn)=>{const writes=[];const result=await fn({get:async p=>read(p),set:(p,v)=>writes.push([p,v])});for(const [p,v] of writes)data.set(p,v);after();return result;}};
 const capture=createFacultySparkCapture({db,api,getContext:()=>context,makeReader:()=>({read:async()=>snap})});return {capture,data,snap,api,context:()=>context,setContext:c=>context=c,setAfter:f=>after=f,root};
}
test('captures the full reconciled list and same-ID retries preserve immutable copies',async()=>{
 const f=fixture(),input={orgId:'school',backupId:'abcdefghijklmnop'},r=await f.capture.capture(input);assert.deepEqual(r,{backupId:input.backupId,revision:5,count:2,status:'copies-created-not-restorable'});
 const p=f.root+'sparkVerifiedBackups/'+input.backupId+'/collections/sparkDiscoveryPayments/entries/p';assert.deepEqual(f.data.get(p),{amountCents:100,acceptedBy:'president'});assert.deepEqual(await f.capture.capture(input),r);
 f.data.set(p,{amountCents:200,acceptedBy:'president'});await assert.rejects(f.capture.capture(input),/does not match/);
});
test('a changed revision, missing source or scope reset fails closed',async()=>{
 for(const mode of ['revision','missing','scope']){const f=fixture();if(mode==='missing')f.data.delete(f.root+'sparkDiscoveryPayments/p');else f.setAfter(()=>{f.setAfter(()=>{});if(mode==='revision')f.data.set(f.root+'sparkDiscoveryRevision/current',{revision:6});else f.setContext({...f.context(),scopeToken:2});});await assert.rejects(f.capture.capture({orgId:'school',backupId:'abcdefghijklmnop'}),mode==='scope'?/Workspace changed/:mode==='missing'?/disappeared/:/changed during capture/);}
});
test('only a confirmed owner with a valid workspace and backup ID can start',async()=>{
 const f=fixture();for(const c of [{...f.context(),role:'reviewer'},{...f.context(),memberConfirmed:false},{...f.context(),orgId:'other'}]){f.setContext(c);await assert.rejects(f.capture.capture({orgId:'school',backupId:'abcdefghijklmnop'}),/owner/);}f.setContext({orgId:'school',uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1});await assert.rejects(f.capture.capture({orgId:'school',backupId:'../bad'}),/backup ID/);assert.equal([...f.data.keys()].some(p=>p.includes('sparkVerifiedBackups')),false);
});
test('rejects missing collections, oversized collections, duplicate or invalid IDs',()=>{
 let s=snapshot();delete s.records.lines;assert.throws(()=>planFacultySparkCapture(s),/Incomplete/);s=snapshot();s.records.people=Array.from({length:1001},(_,i)=>({id:String(i)}));assert.throws(()=>planFacultySparkCapture(s),/limit/);for(const ids of [['x','x'],['x/y'],['..']]){s=snapshot();s.records.people=ids.map(id=>({id}));assert.throws(()=>planFacultySparkCapture(s),/record ID/);}
});
test('final marker must be server-confirmed and unchanged',async()=>{const f=fixture();f.api.getDocFromServer=async()=>({metadata:{fromCache:true,hasPendingWrites:false},exists:()=>true,data:()=>({revision:5})});await assert.rejects(f.capture.capture({orgId:'school',backupId:'abcdefghijklmnop'}),/changed during capture/);});
