const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.slice(html.indexOf('function dashboardActionAvailability('), html.indexOf('\nfunction renderAll(){'));
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.attributes={};this.dataset={};this.textContent='';this.disabled=false;}
  setAttribute(k,v){this.attributes[k]=v;}
  append(...children){this.children.push(...children);}
  appendChild(child){this.children.push(child);}
  replaceChildren(...children){this.children=children;}
  addEventListener(type,fn){this[type]=fn;}
}
function setup(){
  const ids={}; for(const id of ['dashboardActionsCard','dashboardActionsCount','dashboardActionsEmpty','dashboardActionsStatus','dashboardActionsList']) ids[id]=new Element();
  const state={orgId:'team',role:'owner',memberConfirmed:true,online:true,baselineReady:true};
  const calls=[];
  const ctx=vm.createContext({window:{pondoTeamState:state},navigator:{onLine:true},document:{getElementById:id=>ids[id],createElement:tag=>new Element(tag),querySelectorAll:()=>[],querySelector:()=>null},
    payables:[],projects:[],funds:[],contributionActivities:[],contributors:[],fmt:n=>'₱'+n,
    approveRefundRequest:(...args)=>calls.push(['approveRefund',...args]),rejectRefundRequest:(...args)=>calls.push(['rejectRefund',...args]),approveDeletionRequest:(...args)=>calls.push(['approveDelete',...args]),rejectDeletionRequest:(...args)=>calls.push(['rejectDelete',...args]),appAlert:m=>calls.push(['alert',m]),switchTab:t=>calls.push(['tab',t]),openFundDetails:id=>calls.push(['fund',id]),openProjectDetails:id=>calls.push(['project',id]),openContributionDetails:id=>calls.push(['activity',id]),contributionSelectedPeriod:{},contributionSearch:'',contributionStatus:''});
  vm.runInContext(source,ctx);return {ctx,state,ids,calls};
}
const request=(who='Ana')=>({requestedBy:{name:who},requestedAt:'2026-01-01T00:00:00Z',reason:'No longer needed'});
test('queue is team approver only and has a clear empty state',()=>{
  const t=setup(), render=()=>t.ctx.renderDashboardActions();render();assert.equal(t.ids.dashboardActionsCard.hidden,false);assert.equal(t.ids.dashboardActionsEmpty.hidden,false);
  for(const role of ['reviewer','projectManager',null]){t.state.role=role;render();assert.equal(t.ids.dashboardActionsCard.hidden,true);}
  t.state.role='disbursing';render();assert.equal(t.ids.dashboardActionsCard.hidden,false);t.state.orgId=null;render();assert.equal(t.ids.dashboardActionsCard.hidden,true);
});
test('all pending types are listed, safely rendered and invoke existing flows',()=>{
  const t=setup(),c=t.ctx;c.payables.push({id:'r',kind:'advance',description:'<img onerror=alert(1)>',amount:25,reimburseTo:'Sam',pendingApproval:request()}, {id:'normal',kind:'invoice',pendingApproval:request()}, {id:'paid',kind:'advance'});
  c.funds.push({id:'f',name:'Fund',pendingDeletion:request()});c.projects.push({id:'p',name:'Project',pendingDeletion:request()});c.contributionActivities.push({id:'a',title:'Activity',pendingDeletion:request()});c.contributors.push({id:'c',activityId:'a',name:'Person',period:'2026-01',pendingDeletion:request()});
  c.renderDashboardActions();const list=t.ids.dashboardActionsList;assert.equal(list.children.length,5);assert.equal(t.ids.dashboardActionsCount.textContent,'5');assert.equal(t.ids.dashboardActionsEmpty.hidden,true);
  assert.equal(list.children[0].children[0].children[0].textContent,'Refund request · <img onerror=alert(1)>');
  list.children[0].children[1].children[1].click();assert.equal(t.calls[0][0],'approveRefund');assert.equal(t.calls[0][1],'r');assert.equal(t.calls[0][2](),true);
  list.children[4].children[1].children[2].click();assert.equal(t.calls[1][0],'rejectDelete');assert.equal(t.calls[1][1],'contributor');assert.equal(t.calls[1][2],'c');
  c.funds[0].pendingDeletion=null;c.renderDashboardActions();assert.equal(t.ids.dashboardActionsCount.textContent,'4');
});
test('unconfirmed or failed sync cannot be mistaken for empty or actionable',()=>{
  const t=setup(),c=t.ctx;c.funds.push({id:'f',name:'Fund',pendingDeletion:request()});
  t.state.baselineReady=false;c.renderDashboardActions();assert.equal(t.ids.dashboardActionsList.children.length,0);assert.equal(t.ids.dashboardActionsCount.hidden,true);assert.equal(t.ids.dashboardActionsEmpty.hidden,true);assert.match(t.ids.dashboardActionsStatus.textContent,/confirmed/);
  t.state.baselineReady=true;for(const property of ['dirty','syncError','listenerError','recoveryLocked']){t.state[property]=true;c.renderDashboardActions();assert.equal(t.ids.dashboardActionsList.children[0].children[1].children[1].disabled,true);t.state[property]=false;}
  t.state.online=false;c.renderDashboardActions();assert.equal(t.ids.dashboardActionsList.children[0].children[1].children[2].disabled,true);
  t.state.online=true;c.renderDashboardActions();const approve=t.ids.dashboardActionsList.children[0].children[1].children[1];t.state.syncError=true;approve.click();assert.equal(t.calls[0][0],'alert');
});
test('review navigates to the relevant item and clears contributor filters',()=>{
 const t=setup(),c=t.ctx;c.contributionActivities.push({id:'a',title:'Activity'});c.contributors.push({id:'c',name:'Person',activityId:'a',period:'2026-01',pendingDeletion:request()});c.contributionSearch='old';c.contributionStatus='Paid';c.renderDashboardActions();t.ids.dashboardActionsList.children[0].children[1].children[0].click();assert.equal(c.contributionSelectedPeriod.a,'2026-01');assert.equal(c.contributionSearch,'');assert.equal(c.contributionStatus,'');assert.deepEqual(t.calls.slice(0,2),[['tab','contributions'],['activity','a']]);
});
test('review handlers recheck request, role, workspace and dashboard sync guard after dialogs',async()=>{
 const start=html.indexOf('function canApproveDeletions()'),end=html.indexOf('// Anyone who can edit data at all',start);
 const handlers=html.slice(start,end);let resolve;const record={id:'f',name:'Fund',pendingDeletion:request()},state={orgId:'one',role:'owner'};let deleted=0,alerts=[];
 const ctx=vm.createContext({pondoTeamState:state,funds:[record],projects:[],contributionActivities:[],contributors:[],contributionPayments:[],payables:[],auditLog:[],appConfirm:()=>new Promise(r=>resolve=r),appAlert:m=>alerts.push(m),makeId:()=>1,currentUserDisplayName:()=>'',currentActorStamp:()=>null,renderAll:()=>{},fmt:String});
 vm.runInContext(handlers+'\nPENDING_DELETION_FORCE.fund=()=>deleted++;',ctx);ctx.deleted=0;
 let allowed=true;const pending=ctx.approveDeletionRequest('fund','f',()=>allowed);allowed=false;resolve(true);await pending;assert.equal(ctx.deleted,0);assert.match(alerts.pop(),/changed/);
 const pending2=ctx.approveDeletionRequest('fund','f',()=>true);state.orgId='two';resolve(true);await pending2;assert.equal(ctx.deleted,0);assert.match(alerts.pop(),/changed/);
});
test('queue refreshes with sync and role updates and refund review exposes local receipts',()=>{
 assert.match(html,/function renderAll\(\)\{\s*renderDashboardActions\(\)/);assert.match(html,/function applyRoleUI\(\) \{\s*if \(window\.renderDashboardActions\)/);assert.match(html,/function setSyncBadge\(mode\) \{\s*if \(window\.renderDashboardActions\)/);assert.match(html,/Receipt attachments are not synced between devices/);
});
