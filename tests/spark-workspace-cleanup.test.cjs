'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
async function setup(){
 const {createExperimentalSparkCleanup}=await import('../experiments/spark-workspace-delete/cleanup.mjs');
 const docs=new Map([['organizations/o',{name:'Org'}],['organizations/o/members/u',{uid:'u',role:'owner'}],['organizations/o/members/v',{uid:'v',role:'reviewer'}],['organizations/o/data/snapshot',{funds:[]}],['organizations/o/refundReceipts/r',{image:'private'}],['invites/i',{orgId:'o'}]]);
 const context={orgId:'o',uid:'u',currentUid:'u',online:true},snap=path=>({exists:()=>docs.has(path),data:()=>docs.get(path),metadata:{fromCache:false,hasPendingWrites:false}});
 let getDocsHook=null,failCommit=false;
 const api={doc:(_,...p)=>p.join('/'),collection:(_,...p)=>p.join('/'),where:(key,op,value)=>({key,op,value}),limit:n=>({limit:n}),query:(p,...parts)=>({p,parts}),serverTimestamp:()=>1,getDocFromServer:async ref=>snap(ref),
 runTransaction:async(_,fn)=>fn({get:async ref=>snap(ref),update:(ref,patch)=>docs.set(ref,{...docs.get(ref),...patch})}),
 getDocsFromServer:async q=>{if(getDocsHook)await getDocsHook(q);const ids=[...docs.keys()].filter(k=>k.startsWith(q.p+'/')&&!k.slice(q.p.length+1).includes('/')).filter(k=>q.p!=='invites'||docs.get(k).orgId===q.parts[0].value).slice(0,20);return {metadata:{fromCache:false,hasPendingWrites:false},docs:ids.map(k=>({id:k.split('/').at(-1),ref:k}))}},
 writeBatch:()=>{const del=[];return {delete:r=>del.push(r),commit:async()=>{if(failCommit)throw Error('offline');del.forEach(k=>docs.delete(k))}}}};
 return {cleanup:createExperimentalSparkCleanup({db:{},api,getContext:()=>context}),context,docs,hook:fn=>getDocsHook=fn,fail:v=>failCommit=v};
}
test('freeze is owner-only, scoped, idempotent and never finalizes',async()=>{
 const t=await setup();assert.equal(await t.cleanup.freeze('o','u'),'frozen');assert.equal(await t.cleanup.freeze('o','u'),'already-frozen');assert.equal(t.docs.get('organizations/o').deletionState,'deleting');
 t.context.currentUid='other';await assert.rejects(t.cleanup.clearNext('o','u'),/changed/);t.context.currentUid='u';t.docs.get('organizations/o/members/u').role='reviewer';await assert.rejects(t.cleanup.freeze('o','u'),/owner/);
});
test('known groups clear in bounded resumable steps but owner and root remain, never reporting completed deletion',async()=>{
 const t=await setup();await t.cleanup.freeze('o','u');t.fail(true);await assert.rejects(t.cleanup.clearNext('o','u'),/offline/);assert.ok(t.docs.has('organizations/o/data/snapshot'));t.fail(false);
 const results=[];for(let i=0;i<10;i++){const r=await t.cleanup.clearNext('o','u');results.push(r);if(r.state==='awaiting-verification')break;}
 assert.deepEqual(results.map(r=>r.state),['in-progress','in-progress','in-progress','in-progress','awaiting-verification']);assert.equal(results.at(-1).finalized,false);assert.ok(t.docs.has('organizations/o/members/u'));assert.equal(t.docs.get('organizations/o').deletionState,'deleting');
});
test('scope changes during a read prevent the next destructive batch',async()=>{
 const t=await setup();await t.cleanup.freeze('o','u');t.hook(async()=>{t.context.orgId='other'});await assert.rejects(t.cleanup.clearNext('o','u'),/changed/);assert.ok(t.docs.has('organizations/o/data/snapshot'));
});
