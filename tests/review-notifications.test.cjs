const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const queue=html.slice(html.indexOf('function dashboardPendingRequests('),html.indexOf('\nfunction renderDashboardActions()'));
const source=html.slice(html.indexOf('const reviewNotificationMemory='),html.indexOf('\nfunction updateFundRailHint()'));
function environment(store=new Map()){
  const notifications=[];
  const localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  const context=vm.createContext({window:{},localStorage,pushNotification:n=>{notifications.push(n);return n}});
  vm.runInContext(queue+'\n'+source,context);return {context,notifications,store};
}
function snapshot(){return {payables:[],funds:[],projects:[],contributionActivities:[],contributors:[],auditLog:[]};}
function state(uid='owner',role='owner',orgId='org'){return {uid,role,orgId,orgName:'Team A',memberConfirmed:true,baselineReady:true};}
function req(uid='requester'){return {requestedBy:{uid,name:'Requester'},requestedAt:'2026-11-01T10:00:00Z'};}
function decision(id,action,uid='requester'){
  const refund=action.includes('refund'),reject=action.startsWith('reject');
  return {id,action,by:{uid:'owner'},reason:'Missing receipt',record:refund?(reject?{description:'Taxi',pendingApproval:req(uid)}:{description:'Taxi',requestedBy:{uid}}):{label:'Event',type:'project',requestedBy:{uid}}};
}
test('owners and disbursing officers receive current pending requests without duplicates',()=>{
  const e=environment(),snap=snapshot(),s=state();
  snap.payables.push({id:'r',kind:'advance',description:'Taxi',pendingApproval:req()},{id:'other',kind:'invoice',pendingApproval:req()});
  for(const [key,id,label] of [['funds','f','Fund'],['projects','p','Project'],['contributionActivities','a','Activity'],['contributors','c','Contributor']])snap[key].push({id,name:label,title:label,pendingDeletion:req()});
  e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,5);assert.ok(e.notifications.every(n=>n.approverOnly&&n.action.tab==='dashboard'&&n.recipientUid==='owner'));
  e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,5);
  const restarted=environment(e.store);restarted.context.processReviewNotifications(snap,s);assert.equal(restarted.notifications.length,0);
  restarted.context.processReviewNotifications(snap,state('officer','disbursing'));assert.equal(restarted.notifications.length,5);
});
test('project managers see no approver notifications, then receive pending on promotion',()=>{
  const e=environment(),snap=snapshot(),s=state('manager','projectManager');snap.funds.push({id:'f',name:'Fund',pendingDeletion:req('another')});
  e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,0);s.role='owner';e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,1);
  snap.funds.push({id:'own',name:'Own',pendingDeletion:req('manager')});e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,1);
});
test('only the requester receives confirmed outcomes, with correct refund and deletion navigation',()=>{
  const e=environment(),snap=snapshot(),s=state('requester','projectManager');e.context.processReviewNotifications(snap,s);
  snap.auditLog.push(decision('a','approve refund request'),decision('b','reject refund request'),decision('c','approve deletion request'),decision('d','reject deletion request'),decision('e','approve refund request','someone-else'));
  e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,4);
  assert.deepEqual(Array.from(e.notifications,n=>n.title),['Refund request approved','Refund request rejected','Deletion request approved','Deletion request rejected']);
  assert.match(e.notifications[0].body,/not payment/);assert.match(e.notifications[1].body,/Missing receipt/);assert.equal(e.notifications[0].action.tab,'refunds');assert.equal(e.notifications[2].action.audit,true);assert.equal(e.notifications[2].action.tab,'transactions');
  e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,4);
});
test('initial snapshot seeds past outcomes, later reload catches up once',()=>{
  const e=environment(),snap=snapshot(),s=state('requester','projectManager');snap.auditLog.push(decision('old','approve refund request'));e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,0);
  snap.auditLog.push(decision('new','reject deletion request'));const restarted=environment(e.store);restarted.context.processReviewNotifications(snap,s);assert.equal(restarted.notifications.length,1);assert.equal(restarted.notifications[0].title,'Deletion request rejected');
  const again=environment(e.store);again.context.processReviewNotifications(snap,s);assert.equal(again.notifications.length,0);
});
test('no processing before a confirmed snapshot and role, or during sync errors',()=>{
  const e=environment(),snap=snapshot(),s=state();snap.funds.push({id:'f',name:'Fund',pendingDeletion:req()});
  for(const change of [{role:null},{baselineReady:false},{syncError:true},{listenerError:true},{recoveryLocked:true}]){e.context.processReviewNotifications(snap,{...s,...change});assert.equal(e.notifications.length,0);}
  assert.equal(e.store.size,0);e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,1);
});
test('missing requester ID and self-decisions never produce misdirected notifications',()=>{
 const e=environment(),snap=snapshot(),s=state('requester','owner');e.context.processReviewNotifications(snap,s);
 snap.auditLog.push({id:'missing',action:'approve deletion request',record:{label:'X',requestedBy:{name:'Requester'}}},{...decision('self','approve refund request'),by:{uid:'requester'}});e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,0);
});
test('review notifications are scoped and connected to confirmed sync and role listeners',()=>{
 assert.match(html,/uid===n\.recipientUid/);assert.match(html,/!n\.approverOnly \|\| \['owner','disbursing'\]/);
 assert.match(html,/visibleNotifications\(\)\.find\(x=>x\.id===id\)/);assert.match(html,/processReviewNotifications\(rest, pondoTeamState\)/);assert.match(html,/processReviewNotifications\(stripped, pondoTeamState\)/);assert.match(html,/processReviewNotifications\(JSON\.parse\(pondoTeamState\.lastSyncedJSON\), pondoTeamState\)/);
});
test('refund submitter sees new recorded payments and voids, including catch-up after restart',()=>{
 const e=environment(),snap=snapshot(),s=state('requester','project-manager');e.context.fmt=n=>'₱'+n;
 snap.payables.push({id:'r',kind:'advance',description:'Taxi',createdBy:{uid:'requester'},reimburseTo:'Somebody else'});snap.txs=[];
 e.context.processReviewNotifications(snap,s);
 snap.txs.push({id:'p1',type:'OUT',payableId:'r',amount:25,createdBy:{uid:'owner'}});
 const next=environment(e.store);next.context.fmt=n=>'₱'+n;next.context.processReviewNotifications(snap,s);assert.equal(next.notifications.length,1);assert.equal(next.notifications[0].title,'Refund payment recorded');assert.match(next.notifications[0].body,/₱25 recorded/);
 next.context.processReviewNotifications(snap,s);assert.equal(next.notifications.length,1);
 snap.txs=[];snap.auditLog.push({id:'void',action:'void transaction',by:{uid:'owner'},reason:'Wrong amount',record:{type:'OUT',payableId:'r'}});next.context.processReviewNotifications(snap,s);
 assert.equal(next.notifications[1].title,'Refund payment voided');assert.equal(next.notifications[1].action.audit,true);assert.match(next.notifications[1].body,/Wrong amount/);
});
test('cancellation targets only the identified submitter; void context survives missing payable',()=>{
 const e=environment(),snap=snapshot(),s=state('requester','project-manager');e.context.fmt=String;e.context.processReviewNotifications(snap,s);
 snap.auditLog.push({id:'cancel',action:'void payable',by:{uid:'owner'},reason:'Duplicate',record:{kind:'advance',description:'Taxi',pendingApproval:req()}});
 snap.auditLog.push({id:'reversal',action:'void transaction',by:{uid:'owner'},reason:'Mistake',record:{type:'OUT',payableId:'gone'},refundContext:{kind:'advance',description:'Travel',createdBy:{uid:'requester'}}});
 e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,2);assert.equal(e.notifications[0].title,'Refund request cancelled');assert.equal(e.notifications[1].title,'Refund payment voided');
 const other=environment();other.context.fmt=String;const blank=snapshot();other.context.processReviewNotifications(blank,state('payee','project-manager'));other.context.processReviewNotifications(snap,state('payee','project-manager'));assert.equal(other.notifications.length,0);
});
test('confirmed own role changes are scoped and caught on returning',()=>{
 const e=environment(),s=state('me','project-manager');e.context.processMemberRoleNotification(s);assert.equal(e.notifications.length,0);
 const restarted=environment(e.store);s.role='disbursing';restarted.context.processMemberRoleNotification(s);assert.equal(restarted.notifications.length,1);assert.match(restarted.notifications[0].body,/Disbursing Officer/);assert.equal(restarted.notifications[0].recipientUid,'me');restarted.context.processMemberRoleNotification(s);assert.equal(restarted.notifications.length,1);
});
test('notification delivery failures do not mark pending or decision events as delivered',()=>{
 const e=environment(),snap=snapshot(),s=state();let fail=true;const output=[];e.context.pushNotification=n=>{if(fail)return null;output.push(n);return n};snap.funds.push({id:'f',name:'Fund',pendingDeletion:req()});e.context.processReviewNotifications(snap,s);fail=false;e.context.processReviewNotifications(snap,s);assert.equal(output.length,1);
 const person=state('requester','project-manager');const blank=snapshot();e.context.processReviewNotifications(blank,person);snap.auditLog.push(decision('approval','approve refund request'));fail=true;e.context.processReviewNotifications(snap,person);fail=false;e.context.processReviewNotifications(snap,person);assert.equal(output.at(-1).title,'Refund request approved');
});
test('unconfirmed membership cannot create targeted alerts',()=>{
 const e=environment(),snap=snapshot(),s=state();snap.funds.push({id:'f',name:'Fund',pendingDeletion:req()});s.memberConfirmed=false;e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,0);assert.equal(e.store.size,0);s.memberConfirmed=true;e.context.processReviewNotifications(snap,s);assert.equal(e.notifications.length,1);
});
