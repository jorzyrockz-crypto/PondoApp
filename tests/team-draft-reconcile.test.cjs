'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fields,key}=require('../offline-sync.js');
const blank=()=>Object.fromEntries([['org',{name:'Team'}],...fields.map(k=>[k,[]])]);
let mod;test.before(async()=>{mod=await import('../team-draft-reconcile.mjs')});
function setup(){
 const target=blank();target.funds=[{id:'same',name:'Team'},{id:'team-only',name:'Team only'}];const draft=blank();draft.org.name='Old';draft.funds=[{id:'same',name:'Draft'},{id:'new',name:'New'}];
 const state={orgId:'team',uid:'u',role:'owner',recoveryLocked:true,online:true},user={uid:'u'},storage={raw:JSON.stringify(draft)},server={...target,_syncRevision:4},member={role:'owner'};let writes=[],failure={error:null};
 const snap=data=>({exists:()=>data!=null,data:()=>data});const doc=(_db,...parts)=>parts.join('/');
 const api={doc,getDocFromServer:async ref=>snap(ref.includes('/members/')?member:server),runTransaction:async(_db,fn)=>{if(failure.error)throw Error(failure.error);return fn({get:async ref=>snap(ref.includes('/members/')?member:server),set:(_ref,data)=>writes.push(data)})},serverTimestamp:()=>123};
 const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,k)=>(o[k]=x[k],o),{}):x);
 const sharedData=x=>{let {_syncRevision,updatedBy,updatedAt,writerClientId,...rest}=x;return rest};
 const service=mod.createTeamDraftReconciler({db:{},api,getState:()=>state,getUser:()=>user,getDraft:()=>storage.raw,validate:()=>{},stripSnapshot:x=>x,stableJSON:stable,sharedData,sharedRevision:d=>d?d._syncRevision||0:0,clientId:'client'});
 return {target,draft,state,user,storage,server,member,api,service,failure,get writes(){return writes}};
}
const choices={[key('funds','same')]:'offline',[key('funds','new')]:'add'};
test('explicit choices are required for draft-only additions and conflicts; team-only and settings survive',()=>{
 const t=setup();let p=mod.reviewTeamDraftPlan(t.target,t.draft,{});assert.equal(p.unresolved,2);p=mod.reviewTeamDraftPlan(t.target,t.draft,choices);assert.equal(p.unresolved,0);assert.deepEqual(p.merged.funds.map(x=>x.name),['Draft','Team only','New']);assert.equal(p.merged.org.name,'Team');p=mod.reviewTeamDraftPlan(t.target,t.draft,{[key('funds','same')]:'destination',[key('funds','new')]:'skip'});assert.equal(p.changes.length,0);assert.equal(p.skipped,1);
});
test('server transaction confirms membership and reviewed baseline, writes revision, and does not touch the draft',async()=>{
 const t=setup(),r=await t.service.review('team','u'),result=await t.service.commit(r,choices);assert.equal(t.writes.length,1);assert.equal(t.writes[0]._syncRevision,5);assert.equal(result.revision,5);assert.equal(t.storage.raw,JSON.stringify(t.draft));assert.deepEqual(result.snapshot.funds.map(f=>f.name),['Draft','Team only','New']);
});
test('no changes checks server transaction but does not write',async()=>{const t=setup(),r=await t.service.review('team','u'),result=await t.service.commit(r,{[key('funds','same')]:'destination',[key('funds','new')]:'skip'});assert.equal(t.writes.length,0);assert.equal(result.revision,4)});
test('stale server, revoked membership, switched workspace, and changed draft block writes',async()=>{
 for(const change of [t=>t.server._syncRevision++,t=>t.server.funds[0].name='changed',t=>t.member.role='reviewer',t=>t.state.orgId='other',t=>t.user.uid='other',t=>t.storage.raw='different',t=>t.state.recoveryLocked=false,t=>t.state.listenerError=true]){const t=setup(),r=await t.service.review('team','u');change(t);await assert.rejects(t.service.commit(r,choices));assert.equal(t.writes.length,0);}
});
test('workflow-bearing records and local refund receipts cannot be copied or overwritten',()=>{
 const t=setup();for(const flag of [{pendingApproval:{}},{pendingDeletion:{}},{sharedReceiptDigest:'abc'},{receiptDigest:'abc'}]){const d=structuredClone(t.draft);Object.assign(d.funds[0],flag);assert.throws(()=>mod.checkedTeamDraftPlan(t.target,d,choices,()=>{}),/pending approvals/);}const d=structuredClone(t.draft);d.payables.push({id:'receipt',kind:'advance',receiptImage:'data:image/jpeg;base64,abc'});assert.throws(()=>mod.checkedTeamDraftPlan(t.target,d,{...choices,[key('payables','receipt')]:'add'},()=>{}),/local receipt/);
});
test('failed or unknown transaction results do not claim confirmation or modify draft',async()=>{const t=setup(),r=await t.service.review('team','u');t.failure.error='network';await assert.rejects(t.service.commit(r,choices),/network/);assert.equal(t.storage.raw,JSON.stringify(t.draft));});
