const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),source=html.slice(html.indexOf('const memberRefundRejectionMemory='),html.indexOf('function memberRefundSetView('));
function setup(){
 const state={orgId:'team',uid:'viewer',role:'reviewer',orgName:'Team',memberConfirmed:true,baselineReady:true,online:true},window={pondoTeamState:state,pondoCurrentUser:{uid:'viewer'}},entries=[],store=new Map();let fail=false;
 const localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const ctx=vm.createContext({window,localStorage,navigator:{onLine:true},Date,pushNotification:item=>{if(fail)return null;entries.push(item);return item}});vm.runInContext(source,ctx);
 const item=(id,delta=0)=>({id,uid:'viewer',status:'rejected',decidedBy:'owner',decidedAt:{toMillis:()=>Date.now()+delta},description:'Sensitive',decisionReason:'Private reason',amountCents:30000});
 const view={org:'team',uid:'viewer',status:'ready',items:[]};return {ctx,state,window,entries,store,view,item,setFail:v=>fail=v};
}
test('notifies the requester once for a recent rejection, without private details',()=>{
 const t=setup();t.ctx.processMemberRefundRejections(t.view);t.view.items=[t.item('r')];t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,1);const n=t.entries[0];assert.equal(n.title,'Refund request rejected');assert.equal(n.recipientUid,'viewer');assert.equal(n.orgId,'team');assert.equal(n.visualKind,'refund');assert.equal(n.action.tab,'refunds');assert.equal(n.action.memberRefundHistory,true);assert.doesNotMatch(JSON.stringify(n),/Sensitive|Private reason|30000/);t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,1);
});
test('recent outcomes catch up on first open or return; old outcomes are not replayed',()=>{
 const t=setup();t.view.items=[t.item('recent',-86400000),t.item('old',-8*86400000),t.item('future',86400000)];t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,1);t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,1);
 const restarted=setup();restarted.store.set([...t.store.keys()][0],[...t.store.values()][0]);restarted.view.items=[restarted.item('recent',-86400000),restarted.item('new',-1000)];restarted.ctx.processMemberRefundRejections(restarted.view);assert.equal(restarted.entries.length,1);
});
test('does not disclose other members, unconfirmed data, other workspaces or changed accounts',()=>{
 for(const mutate of [t=>t.view.status='unconfirmed',t=>t.state.memberConfirmed=false,t=>t.state.baselineReady=false,t=>t.state.listenerError=true,t=>t.state.recoveryLocked=true,t=>t.state.online=false,t=>t.state.orgId='other',t=>t.window.pondoCurrentUser.uid='other',t=>t.view.items[0].uid='other',t=>t.view.items[0].decidedBy='viewer',t=>t.view.items[0].status='approved']){const t=setup();t.view.items=[t.item('r')];mutate(t);t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,0)}
});
test('failed notification delivery is retried; unreadable storage does not send duplicates',()=>{
 const t=setup();t.view.items=[t.item('r')];t.setFail(true);t.ctx.processMemberRefundRejections(t.view);t.setFail(false);t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,1);t.ctx.localStorage.getItem=()=>{throw Error('blocked')};t.view.items=[t.item('other')];t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,1);
});
test('only confirmed inbox snapshots feed the rejection processor and share existing click navigation',()=>{
 assert.match(html,/function memberRefundSetView\(view\)\{memberRefundView=view;if\(view.status==='ready'\)processMemberRefundRejections\(view\)/);assert.match(html,/if\(action.memberRefundInbox\)/);
});

test('storage write failures do not repeatedly notify in the same tab',()=>{
 const t=setup();t.view.items=[t.item('r')];t.ctx.localStorage.setItem=()=>{throw Error('quota')};t.ctx.processMemberRefundRejections(t.view);t.ctx.processMemberRefundRejections(t.view);assert.equal(t.entries.length,1);
});
