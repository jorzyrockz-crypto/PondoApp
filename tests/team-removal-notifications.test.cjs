'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function removal(){
 const src=html.slice(html.indexOf('async function removeMember(uid)'),html.indexOf('\nasync function leaveOrganization()',html.indexOf('async function removeMember(uid)')));
 const state={orgId:'org',orgName:'School',uid:'owner',role:'owner',memberConfirmed:true,members:[{uid:'member',displayName:'Alice'}]},ops=[],messages=[],pushed=[],pending=new Set();
 const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'owner'},pushNotification:n=>pushed.push(n)},navigator:{onLine:true},pendingTeamRemovals:pending,confirmAction:async()=>true,notify:m=>messages.push(m),firestoreDb:{},doc:(...args)=>args.length===1?['generated','notice']:args.slice(1),collection:(_,...args)=>args,serverTimestamp:()=>'<server>',setTimeout(){},runTransaction:async(_db,fn)=>fn({get:async ref=>({exists:()=>true,data:()=>({name:'School'})}),set:(ref,data)=>ops.push(['set',ref,data]),delete:ref=>ops.push(['delete',ref])})};
 vm.runInNewContext(src,c);return {c,state,ops,messages,pushed,pending};
}
test('confirmed owner removal atomically writes a notice and revokes membership',async()=>{
 const t=removal();await t.c.removeMember('member');assert.equal(t.ops.length,2);assert.equal(t.ops[0][2].kind,'removed');assert.equal(t.ops[0][2].actorUid,'owner');assert.equal(t.ops[1][0],'delete');assert.equal(t.ops[1][1][1],'org');assert.match(t.messages[0],/Member removed/);assert.equal(t.pushed.length,1);
});
test('failed removal never claims success and unconfirmed/offline actors cannot write',async()=>{
 const t=removal();t.c.runTransaction=async()=>{throw Error('denied')};await t.c.removeMember('member');assert.match(t.messages[0],/could not be confirmed/i);assert.equal(t.pushed.length,0);assert.equal(t.pending.size,0);
 t.messages.length=0;t.state.memberConfirmed=false;await t.c.removeMember('member');t.state.memberConfirmed=true;t.c.navigator.onLine=false;await t.c.removeMember('member');assert.equal(t.ops.length,0);assert.match(t.messages[0],/Connect/);
});
test('inbox accepts only confirmed server snapshots and clears on account change',async()=>{
 const src=html.slice(html.indexOf('let removalInboxUnsub='),html.indexOf("const authGate =",html.indexOf('let removalInboxUnsub=')));
 const events=[];let next,error;const win={pondoCurrentUser:{uid:'u'},updateNotifBadge(){},refreshNotifCenterIfOpen(){}};
 const c={window:win,firestoreDb:{},query:(...a)=>a,collection:(_,...a)=>a,orderBy:(...a)=>a,limit:a=>a,onSnapshot:(_r,_o,n,e)=>{next=n;error=e;return()=>events.push('unsub')},doc:(_,...a)=>a,updateDoc:async(ref,v)=>events.push([ref,v]),notify(){},console:{warn(){}},Number};vm.runInNewContext(src,c);c.startRemovalInbox('u');
 const snap=meta=>({metadata:meta,forEach:fn=>fn({id:'n1',data:()=>({kind:'removed',orgName:'School',createdAt:{toMillis:()=>100},read:false})})});
 next(snap({fromCache:true,hasPendingWrites:false}));assert.equal(win.pondoRemovalNotices.length,0);next(snap({fromCache:false,hasPendingWrites:false}));assert.equal(win.pondoRemovalNotices[0].recipientUid,'u');await win.pondoMarkRemovalNoticeRead('n1');assert.equal(events[0][0][1],'u');
 win.pondoCurrentUser={uid:'v'};next(snap({fromCache:false,hasPendingWrites:false}));assert.equal(win.pondoRemovalNotices[0].recipientUid,'u');c.stopRemovalInbox();assert.equal(win.pondoRemovalNotices.length,0);error(Error('late'));assert.equal(win.pondoRemovalInboxUnavailable,false);
});
