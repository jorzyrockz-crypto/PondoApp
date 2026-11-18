'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const wait=()=>new Promise(resolve=>setImmediate(resolve));
const timestamp=(seconds,nanoseconds=0)=>({seconds,nanoseconds,toMillis:()=>seconds*1000+nanoseconds/1e6});
async function harness({listed=false,status='approved',member=true,created=false}={}){
 const {createWorkspaceApprovalTracker}=await import('../workspace-approval.mjs');
 const db=new Map(),watch=new Map(),events=[],errors=[];let current='u',chain=Promise.resolve();
 const profile='users/u',mine='users/u/organizationRequests/org~school',memberPath='organizations/org~school/members/u',request='organizations/org~school/joinRequests/u';
 db.set(profile,{orgMemberships:listed?['org~school']:[],activeOrganizationId:null});
 db.set(mine,{orgId:'org~school',name:'School',created});
 if(member)db.set(memberPath,{uid:'u',role:'reviewer',approvedBy:'owner',joinedAt:timestamp(42)});
 db.set(request,{status,decidedBy:'owner',decidedAt:timestamp(42)});
 const snap=(path,metadata={fromCache:false,hasPendingWrites:false})=>({metadata,id:path.split('/').at(-1),exists:()=>db.has(path),data:()=>db.get(path)});
 const api={doc:(_, ...p)=>p.join('/'),collection:(_, ...p)=>p.join('/'),query:path=>path,limit:n=>n,arrayUnion:id=>({union:id}),serverTimestamp:()=>timestamp(43),
  onSnapshot:(path,_options,fn,err)=>{watch.set(path,{fn,err});return()=>watch.delete(path)},
  runTransaction:(_db,fn)=>{const run=chain.then(async()=>{const writes=[];const tx={get:async path=>snap(path),set:(path,data)=>writes.push(['set',path,data]),update:(path,data)=>writes.push(['update',path,data])};const result=await fn(tx);for(const [,path,data] of writes){const next={...(db.get(path)||{})};for(const [key,value] of Object.entries(data)){if(value&&value.union)next[key]=[...new Set([...(next[key]||[]),value.union])];else next[key]=value;}db.set(path,next);}return result});chain=run.catch(()=>{});return run}
 };
 const tracker=createWorkspaceApprovalTracker({db,api,isCurrent:id=>current===id,onChange:items=>events.push(items),onMembership:id=>events.push('joined:'+id),onError:e=>errors.push(e)});
 function list(meta={fromCache:false,hasPendingWrites:false}){watch.get('users/u/organizationRequests')?.fn({metadata:meta,forEach:fn=>fn(snap(mine))});}
 function membership(meta){watch.get(memberPath)?.fn(snap(memberPath,meta));}
 function start(){tracker.start('u');list();}
 return {tracker,db,events,errors,list,membership,start,mine,memberPath,request,profile,setCurrent:id=>current=id};
}
test('approval adds only confirmed membership and persists account-scoped unread and new flags',async()=>{
 const t=await harness();t.start();t.membership({fromCache:true,hasPendingWrites:false});await wait();assert.deepEqual(t.db.get(t.profile).orgMemberships,[]);
 t.membership();await wait();assert.deepEqual(t.db.get(t.profile).orgMemberships,['org~school']);assert.equal(t.db.get(t.profile).activeOrganizationId,null);assert.equal(t.db.get(t.mine).approvalNoticeRead,false);assert.equal(t.db.get(t.mine).approvalNewSeen,false);assert.ok(t.events.includes('joined:org~school'));
 t.list();const item=t.events.at(-1)[0];assert.equal(item.orgId,'org~school');assert.equal(item.newSeen,false);assert.equal(item.read,false);
 await t.tracker.markSeen(item.orgId,item.key);await t.tracker.markRead(item.orgId,item.key);t.list();assert.equal(t.events.at(-1)[0].newSeen,true);assert.equal(t.events.at(-1)[0].read,true);
 await t.tracker.markSeen(item.orgId,'old-version');assert.equal(t.db.get(t.mine).approvalKey,item.key);
});
test('no automatic addition for rejected, removed, unconfirmed or mismatched approvals',async()=>{
 for(const opts of [{status:'rejected'},{member:false},{created:true}]){const t=await harness(opts);t.start();t.membership();await wait();assert.deepEqual(t.db.get(t.profile).orgMemberships,[]);assert.equal(t.db.get(t.mine).approvalKey,undefined);}
 const t=await harness();t.db.get(t.request).decidedAt=timestamp(43);t.start();t.membership();await wait();assert.deepEqual(t.db.get(t.profile).orgMemberships,[]);
});
test('old memberships do not receive a false new notice; reapproval gets a fresh one',async()=>{
 const t=await harness({listed:true});t.start();t.membership();await wait();assert.equal(t.db.get(t.mine).approvalKey,undefined);
 t.db.set(t.mine,{...t.db.get(t.mine),approvalKey:'41:0:owner',approvalNoticeRead:true,approvalNewSeen:true});t.membership();await wait();t.list();assert.equal(t.events.at(-1)[0].read,false);assert.equal(t.events.at(-1)[0].newSeen,false);
 t.db.delete(t.memberPath);t.membership();assert.deepEqual(t.events.at(-1),[]);await t.tracker.markRead('org~school','41:0:owner');assert.equal(t.db.get(t.mine).approvalNoticeRead,false);
});
test('account changes and stopped trackers reject late callbacks',async()=>{
 const t=await harness();t.start();t.setCurrent('other');t.membership();await wait();assert.deepEqual(t.db.get(t.profile).orgMemberships,[]);t.tracker.stop();assert.deepEqual(t.events.at(-1),[]);
});
test('UI has account-scoped notices and one-time tags in both switchers',()=>{
 const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.equal((html.match(/class="workspace-new-tag"/g)||[]).length,2);assert.match(html,/pondoMarkVisibleWorkspaceNewsSeen/);assert.match(html,/kind:'workspaceApproval'/);assert.match(html,/uid&&n.recipientUid===uid/);assert.match(html,/approvalTracker\.start\(user\.uid\)/);assert.match(sw,/\.\/workspace-approval\.mjs/);
});
