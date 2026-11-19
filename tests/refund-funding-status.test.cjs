const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const accounting=html.slice(html.indexOf('function cents(v)'),html.indexOf('function payableStatus('));
const helper=html.slice(html.indexOf('function refundFundingStatus('),html.indexOf('function renderRefundHistory()'));
function setup(){
 const bill={id:'r',kind:'advance',projectId:null,amount:100,invoiceDate:'2026-01-01'};
 const t={funds:[],projects:[],allocations:[],txs:[],payables:[bill],navigator:{onLine:true},window:{pondoTeamState:{orgId:null}},fmt:n=>'₱'+n};
 const ctx=vm.createContext(t);vm.runInContext(accounting+helper,ctx);return {ctx,bill,...t};
}
test('project-free refunds use only uncommitted cash and remain unpaid without it',()=>{
 const t=setup();let status=t.ctx.refundFundingStatus(t.bill);assert.match(status.title,/awaiting uncommitted funds/i);assert.match(status.detail,/No funds are recorded/);
 t.funds.push({id:'f',initialAmount:100});status=t.ctx.refundFundingStatus(t.bill);assert.match(status.title,/awaiting payment.*no project/i);assert.match(status.detail,/₱100/);assert.match(status.detail,/allocations are protected/);
 t.projects.push({id:'p'});t.allocations.push({fundId:'f',projectId:'p',amount:75});status=t.ctx.refundFundingStatus(t.bill);assert.match(status.title,/partly funded/i);assert.match(status.detail,/₱25/);
 t.bill.pendingApproval={};assert.equal(t.ctx.refundFundingStatus(t.bill),null);
});
test('funding uses each project allocation and current cash, supports partial payment, and never reserves or pays',()=>{
 const t=setup();t.bill.projectId='p';t.projects.push({id:'p'});assert.match(t.ctx.refundFundingStatus(t.bill).title,/awaiting funding/i);
 t.funds.push({id:'a',initialAmount:60},{id:'b',initialAmount:500});t.allocations.push({fundId:'a',projectId:'p',amount:60},{fundId:'b',projectId:'other',amount:300});
 const before=JSON.stringify([t.funds,t.allocations,t.txs,t.bill]);let status=t.ctx.refundFundingStatus(t.bill);assert.match(status.title,/partly funded/i);assert.match(status.detail,/₱60.*₱100/);assert.match(status.detail,/not reserved/);assert.equal(JSON.stringify([t.funds,t.allocations,t.txs,t.bill]),before);
 t.allocations.push({fundId:'b',projectId:'p',amount:40});status=t.ctx.refundFundingStatus(t.bill);assert.match(status.title,/awaiting payment/i);assert.match(status.detail,/₱100/);
 t.txs.push({type:'OUT',fundId:'a',projectId:'p',payableId:'r',amount:60});status=t.ctx.refundFundingStatus(t.bill);assert.match(status.title,/awaiting payment/i);assert.match(status.detail,/₱40/);
 t.txs.push({type:'OUT',fundId:'b',projectId:'p',payableId:'r',amount:40});assert.equal(t.ctx.refundFundingStatus(t.bill),null);
});
test('stale or unavailable teams are not presented as funded or unfunded',()=>{
 const t=setup();t.bill.projectId='p';t.projects.push({id:'p'});t.window.pondoTeamState={orgId:'org',memberConfirmed:true,baselineReady:true,online:true};
 for(const change of [s=>s.memberConfirmed=false,s=>s.baselineReady=false,s=>s.online=false,s=>s.dirty=true,s=>s.syncError=true,s=>s.listenerError=true,s=>s.recoveryLocked=true,s=>s.pushesInFlight=1]){const s={orgId:'org',memberConfirmed:true,baselineReady:true,online:true};change(s);t.window.pondoTeamState=s;assert.match(t.ctx.refundFundingStatus(t.bill).title,/unavailable/i)}
 t.window.pondoTeamState={orgId:'org',memberConfirmed:true,baselineReady:true,online:true};t.navigator.onLine=false;assert.match(t.ctx.refundFundingStatus(t.bill).title,/unavailable/i);
});
test('rejection choice is explicit and approval does not reserve cash',()=>{
 assert.match(html,/\['Missing or unclear receipt','Not an approved expense','Wrong amount','Duplicate request','No available funds'\]/);
 assert.match(html,/\['Missing or unclear receipt','Not an approved project expense','Wrong amount','Duplicate request','No available funds'\]/);
 assert.match(html,/To keep a valid request waiting for payment instead, cancel and approve it as unpaid/);
 assert.match(html,/Approval does not check or reserve funds/);
});
