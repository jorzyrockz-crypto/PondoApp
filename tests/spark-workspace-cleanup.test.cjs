'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
async function setup(){
 const {createExperimentalSparkCleanup}=await import('../experiments/spark-workspace-delete/cleanup.mjs');
 const docs=new Map([['organizations/o',{name:'Org'}],['organizations/o/members/u',{uid:'u',role:'owner'}],['organizations/o/members/v',{uid:'v',role:'reviewer'}],['organizations/o/data/snapshot',{funds:[]}],['organizations/o/refundReceipts/r',{image:'private'}],['invites/i',{orgId:'o'}],['users/v',{orgMemberships:['o','another'],displayName:'Viewer',activeOrganizationId:'o',organizationId:'another'}],['users/v/organizationRequests/o',{orgId:'o'}],['organizations/o/sparkDiscoveryPeople/p',{name:'Sample'}]]);
 const context={orgId:'o',uid:'u',currentUid:'u',online:true},snap=path=>({exists:()=>docs.has(path),data:()=>docs.get(path),metadata:{fromCache:false,hasPendingWrites:false}});
 let getDocsHook=null,failCommit=false;
 const api={doc:(_,...p)=>p.join('/'),collection:(_,...p)=>p.join('/'),where:(key,op,value)=>({key,op,value}),limit:n=>({limit:n}),orderBy:key=>({order:key}),documentId:()=> '__name__',startAfter:id=>({after:id}),query:(p,...parts)=>({p,parts}),serverTimestamp:()=>1,arrayRemove:id=>({remove:id}),getDocFromServer:async ref=>snap(ref),
 runTransaction:async(_,fn)=>{const writes=[];const result=await fn({get:async ref=>snap(ref),update:(ref,patch)=>writes.push(()=>docs.set(ref,{...docs.get(ref),...patch})),set:(ref,patch)=>writes.push(()=>{const old=docs.get(ref)||{};docs.set(ref,{...old,...patch,orgMemberships:(old.orgMemberships||[]).filter(id=>id!==patch.orgMemberships.remove)})}),delete:ref=>writes.push(()=>docs.delete(ref))});writes.forEach(f=>f());return result;},
 getDocsFromServer:async q=>{if(getDocsHook)await getDocsHook(q);const ids=[...docs.keys()].filter(k=>k.startsWith(q.p+'/')&&!k.slice(q.p.length+1).includes('/')).filter(k=>q.p!=='invites'||docs.get(k).orgId===q.parts[0].value).sort().filter(k=>!q.parts.find(p=>p.after)||k.split('/').at(-1)>q.parts.find(p=>p.after).after).slice(0,q.parts.find(p=>p.limit)?.limit||20);return {metadata:{fromCache:false,hasPendingWrites:false},docs:ids.map(k=>({id:k.split('/').at(-1),ref:k}))}},
 writeBatch:()=>{const del=[],sets=[];return {delete:r=>del.push(r),set:(r,v)=>sets.push([r,v]),commit:async()=>{if(failCommit)throw Error('offline');for(const [k,v] of sets){const old=docs.get(k)||{},org=v.orgMemberships.remove;for(const field of ['activeOrganizationId','organizationId']){const before=old[field]??null,after=Object.hasOwn(v,field)?v[field]:before;if(after!==(before===org?null:before)){const e=Error('denied');e.code='permission-denied';throw e;}}}for(const [k,v] of sets){const old=docs.get(k)||{},arr=Array.isArray(old.orgMemberships)?old.orgMemberships:[];docs.set(k,{...old,...v,orgMemberships:arr.filter(id=>id!==v.orgMemberships.remove)});}del.forEach(k=>docs.delete(k))}}}};
 return {cleanup:createExperimentalSparkCleanup({db:{},api,getContext:()=>context}),context,docs,hook:fn=>getDocsHook=fn,fail:v=>failCommit=v};
}
test('freeze is owner-only, scoped, idempotent and never finalizes',async()=>{
 const t=await setup();assert.equal(await t.cleanup.freeze('o','u'),'frozen');assert.equal(await t.cleanup.freeze('o','u'),'already-frozen');assert.equal(t.docs.get('organizations/o').deletionState,'deleting');
 t.context.currentUid='other';await assert.rejects(t.cleanup.clearNext('o','u'),/changed/);t.context.currentUid='u';t.docs.get('organizations/o/members/u').role='reviewer';await assert.rejects(t.cleanup.freeze('o','u'),/owner/);
});
test('known groups clear in bounded resumable steps but owner and root remain, never reporting completed deletion',async()=>{
 const t=await setup();await t.cleanup.freeze('o','u');t.fail(true);await assert.rejects(t.cleanup.clearNext('o','u'),/offline/);assert.ok(t.docs.has('organizations/o/data/snapshot'));t.fail(false);
 const results=[];for(let i=0;i<10;i++){const r=await t.cleanup.clearNext('o','u');results.push(r);if(r.state==='awaiting-verification')break;}
 assert.deepEqual(results.map(r=>r.state),['in-progress','in-progress','in-progress','in-progress','in-progress','awaiting-verification']);assert.deepEqual(t.docs.get('users/v').orgMemberships,['another']);assert.equal(t.docs.get('users/v').displayName,'Viewer');assert.equal(t.docs.get('users/v').activeOrganizationId,null);assert.equal(t.docs.get('users/v').organizationId,'another');assert.equal(t.docs.has('users/v/organizationRequests/o'),false);assert.equal(results.at(-1).finalized,false);assert.ok(t.docs.has('organizations/o/members/u'));assert.equal(t.docs.get('organizations/o').deletionState,'deleting');
});
test('scope changes during a read prevent the next destructive batch',async()=>{
 const t=await setup();await t.cleanup.freeze('o','u');t.hook(async()=>{t.context.orgId='other'});await assert.rejects(t.cleanup.clearNext('o','u'),/changed/);assert.ok(t.docs.has('organizations/o/data/snapshot'));
});

test('owner join-request cleanup preserves unrelated selection and retains owner membership',async()=>{
 const t=await setup();t.docs.set('users/u',{orgMemberships:['o','another'],activeOrganizationId:'another',organizationId:'o',displayName:'Owner'});t.docs.set('organizations/o/joinRequests/u',{uid:'u'});t.docs.set('users/u/organizationRequests/o',{orgId:'o'});await t.cleanup.freeze('o','u');
 for(let i=0;i<12;i++){if((await t.cleanup.clearNext('o','u')).state==='awaiting-verification')break;}
 assert.deepEqual(t.docs.get('users/u').orgMemberships,['another']);assert.equal(t.docs.get('users/u').activeOrganizationId,'another');assert.equal(t.docs.get('users/u').organizationId,null);assert.equal(t.docs.get('users/u').displayName,'Owner');assert.ok(t.docs.has('organizations/o/members/u'));assert.ok(!t.docs.has('users/u/organizationRequests/o'));
});

test('recovery cleanup pages parents and removes known nested entries before retaining headers',async()=>{
 const t=await setup(),base='organizations/o/',header=base+'sparkVerifiedBackups/backup00',session=base+'sparkRestoreProofSessions/session00';
 for(let i=0;i<25;i++)t.docs.set(base+'sparkVerifiedBackups/backup'+String(i).padStart(2,'0'),{revision:1});t.docs.set(session,{state:'completed'});
 const entry=header+'/collections/sparkDiscoveryPeople/entries/';for(let i=0;i<25;i++)t.docs.set(entry+String(i).padStart(2,'0'),{name:'Person'});
 const claim=base+'sparkRestoreProof/current/sessions/session00/collections/sparkDiscoveryPayments/entries/p';t.docs.set(claim,{done:true});
 const orphan=base+'sparkVerifiedBackups/missing/collections/sparkDiscoveryPeople/entries/orphan';t.docs.set(orphan,{name:'Undiscoverable'});
 await t.cleanup.freeze('o','u');const first=await t.cleanup.listRecoveryParents('o','u',{type:'backup'});assert.equal(first.ids.length,20);assert.equal(first.completeInventory,false);const second=await t.cleanup.listRecoveryParents('o','u',{type:'backup',cursor:first.nextCursor});assert.equal(second.ids.length,5);assert.equal(second.nextCursor,null);
 t.fail(true);await assert.rejects(t.cleanup.clearRecoveryEntries('o','u',{type:'backup',parentId:'backup00'}),/offline/);assert.ok(t.docs.has(entry+'00'));t.fail(false);
 assert.equal((await t.cleanup.clearRecoveryEntries('o','u',{type:'backup',parentId:'backup00'})).removed,20);assert.equal((await t.cleanup.clearRecoveryEntries('o','u',{type:'backup',parentId:'backup00'})).removed,5);assert.deepEqual(await t.cleanup.clearRecoveryEntries('o','u',{type:'backup',parentId:'backup00'}),{state:'awaiting-verification',type:'backup',finalized:false});
 assert.equal((await t.cleanup.clearRecoveryEntries('o','u',{type:'session',parentId:'session00'})).removed,1);assert.ok(!t.docs.has(claim));assert.ok(t.docs.has(header));assert.ok(t.docs.has(session));assert.ok(t.docs.has(orphan));
 await assert.rejects(t.cleanup.clearRecoveryEntries('o','u',{type:'backup',parentId:'missing'}),/inventory required/);await assert.rejects(t.cleanup.clearRecoveryEntries('o','u',{type:'backup',parentId:'../bad'}),/Invalid/);await assert.rejects(t.cleanup.listRecoveryParents('o','u',{type:'unknown'}),/Unknown/);
});
