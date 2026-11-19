const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function setup(){
 const state={orgId:'org',uid:'owner',role:'owner',memberConfirmed:true,baselineReady:true,online:true,members:[]},window={pondoTeamState:state,pondoCurrentUser:{uid:'owner'}},notifications=[],store=new Map(),payables=[];
 const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const ctx=vm.createContext({window,navigator:{onLine:true},localStorage,payables,memberRefundView:{org:null,uid:null,status:'unconfirmed',items:[]},pushNotification:e=>{notifications.push(e);return e},renderMemberRefundInbox:()=>{}});
 vm.runInContext(html.slice(html.indexOf('let memberRefundPendingView='),html.indexOf('function memberRefundSetView(')),ctx);
 const view={org:'org',uid:'owner',status:'ready',items:[{id:'r',uid:'member',status:'pending',amountCents:100,description:'Private'}]};
 return {ctx,state,window,store,notifications,payables,view};
}
test('confirmed existing or new pending requests notify approvers once per workspace without private details',()=>{
 const t=setup();t.window.memberRefundSetPendingView(t.view);assert.equal(t.notifications.length,1);assert.equal(t.notifications[0].visualKind,'refund');assert.equal(t.notifications[0].approverOnly,true);assert.equal(t.notifications[0].action.tab,'refunds');assert.doesNotMatch(JSON.stringify(t.notifications),/Private|100/);t.window.memberRefundSetPendingView(t.view);assert.equal(t.notifications.length,1);
 t.state.orgId='other';t.window.memberRefundSetPendingView(t.view);assert.equal(t.notifications.length,1);
 t.state.orgId='org';t.state.role='reviewer';t.view.items.push({id:'new',uid:'another',status:'pending'});t.window.memberRefundSetPendingView(t.view);assert.equal(t.notifications.length,1);t.state.role='disbursing';t.ctx.processMemberRefundPendingNotifications();assert.equal(t.notifications.length,2);
});
test('unconfirmed, offline or stale workspace views never notify or expose counts',()=>{
 for(const change of [t=>t.view.status='unconfirmed',t=>t.state.memberConfirmed=false,t=>t.state.baselineReady=false,t=>t.state.orgId='other',t=>t.window.pondoCurrentUser.uid='other',t=>t.state.online=false]){const t=setup();change(t);t.window.memberRefundSetPendingView(t.view);assert.equal(t.notifications.length,0);assert.equal(t.window.memberRefundPendingSummary(),null)}
});
test('failed delivery can retry; matching approved payable avoids double count',()=>{
 const t=setup();t.ctx.pushNotification=()=>null;t.window.memberRefundSetPendingView(t.view);t.ctx.pushNotification=e=>(t.notifications.push(e),e);t.ctx.processMemberRefundPendingNotifications();assert.equal(t.notifications.length,1);t.payables.push({id:'r',kind:'advance'});assert.equal(t.window.memberRefundPendingSummary().items.length,0);
});

test('unsubscribed listeners cannot update a later visit to the same workspace',()=>{
 const seen=[],listeners=[],state={orgId:'org',uid:'owner',memberConfirmed:true,baselineReady:true,online:true};
 const win={memberRefundService:{watch:(_o,_u,cb)=>(listeners.push(cb),()=>{}),watchPending:(_o,_u,cb)=>(listeners.push(cb),()=>{})},memberRefundSetView:v=>seen.push(['recent',v]),memberRefundSetPendingView:v=>seen.push(['pending',v]),addEventListener:()=>{}};
 const start=html.indexOf('let memberRefundUnsub='),end=html.indexOf("window.addEventListener('online',()=>{refreshMemberRefundWatch()",start);
 const ctx=vm.createContext({window:win,pondoTeamState:state});vm.runInContext(html.slice(start,end),ctx);ctx.refreshMemberRefundWatch();ctx.stopMemberRefundWatch();ctx.refreshMemberRefundWatch();seen.length=0;listeners[0]({status:'ready'});listeners[1]({status:'ready'});assert.equal(seen.length,0);listeners[2]({status:'ready'});listeners[3]({status:'ready'});assert.equal(seen.length,2);
});

test('a confirmed decision suppresses a stale pending entry from the other listener',()=>{
 const t=setup();t.window.memberRefundSetPendingView(t.view);assert.equal(t.window.memberRefundPendingSummary().items.length,1);t.ctx.memberRefundView={org:'org',uid:'owner',status:'ready',items:[{id:'r',uid:'member',status:'rejected'}]};assert.equal(t.window.memberRefundPendingSummary().items.length,0);
});
