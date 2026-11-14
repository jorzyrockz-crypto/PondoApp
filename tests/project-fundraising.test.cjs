const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,`${a} to ${b}`);return html.slice(i,j)};
const accounting=slice('function fundCash(', 'function payablePaid(')+slice('function fundraisingAllocated(', 'function setAllocation(');
const paid=slice('function contributionPaid(', 'function contributionTotals(');
const handler=slice('let contributionReceiptReading=false;', 'async function voidContributionPayment(');
const voidFns=slice('function canVoidFundraising(', 'function renderAudit(');
function setup(){
 const input={cPaymentAmount:{value:'75.50'},cPaymentDate:{value:'2026-02-03'},cReceivedBy:{value:'Treasurer'},cPaymentMethod:{value:'raised'},cPaymentRef:{value:'ref'},cPaymentNotes:{value:''},cPaymentFund:{value:'f'}};
 const form={},alerts=[],context={document:{getElementById:id=>id==='contributionForm'?form:input[id]},funds:[{id:'f',initialAmount:100,dateReceived:'2026-01-01'}],projects:[{id:'p',name:'Garden'}],allocations:[{id:'allocation',fundId:'f',projectId:'p',amount:40}],txs:[],contributionActivities:[{id:'activity',title:'Garden fundraiser',fundraising:true,projectId:'p'}],contributors:[{id:'person',activityId:'activity',name:'Alex',expected:100}],contributionPayments:[],payables:[],auditLog:[],appAlert:m=>alerts.push(m),parseMoney:n=>/^\d+(?:\.\d{1,2})?$/.test(String(n))?Math.round(Number(n)*100):null,cents:n=>Math.round((Number(n)||0)*100),readReceipt:async()=>null,validateActualDate:()=>true,currentActorStamp:()=>null,renderAll:()=>{},closeContributionForm:()=>{},activeContributionDetail:null,fmt:n=>'₱'+n,appReasonPrompt:async()=> 'Duplicate',appConfirm:async()=>true,makeId:(()=>{let n=0;return p=>p+'-'+ ++n})(),contributionFormContext:{kind:'payment',activityId:'activity',personId:'person'}};
 vm.createContext(context);vm.runInContext(accounting+'\n'+paid+'\n'+handler+'\n'+voidFns,context);return {context,input,form,alerts};
}
const submit=t=>t.form.onsubmit({preventDefault(){},currentTarget:{querySelector:()=>({disabled:false})}});
test('a fundraiser receipt adds fund cash and an equal project allocation exactly once',async()=>{
 const t=setup(),c=t.context;await submit(t);
 assert.equal(c.contributionPayments.length,1);assert.equal(c.txs.length,1);assert.equal(c.txs[0].type,'IN');assert.equal(c.txs[0].projectId,'p');assert.equal(c.txs[0].contributionPaymentId,c.contributionPayments[0].id);assert.equal(c.fundCash('f'),17550);assert.equal(c.allocationAmount('f','p'),11550);assert.equal(c.fundAvailable('f'),6000);assert.equal(c.contributionBalance(c.contributors[0]),2450);
});
test('fundraising payments validate date, balance, fund and project before any mutation',async()=>{
 for(const mutate of [t=>t.input.cPaymentFund.value='',t=>t.input.cPaymentDate.value='2025-01-01',t=>t.input.cPaymentAmount.value='101',t=>t.context.projects=[],t=>t.input.cPaymentMethod.value='personal']){const t=setup();mutate(t);await submit(t);assert.equal(t.context.contributionPayments.length,0);assert.equal(t.context.txs.length,0);assert.equal(t.context.allocationAmount('f','p'),4000);assert.ok(t.alerts.length)}
});
test('voiding an unspent fundraising receipt reverses payment, cash and allocation together',async()=>{
 const t=setup(),c=t.context;await submit(t);await c.voidTransaction(c.txs[0].id);assert.equal(c.txs.length,0);assert.equal(c.contributionPayments.length,0);assert.equal(c.fundCash('f'),10000);assert.equal(c.allocationAmount('f','p'),4000);assert.equal(c.contributionBalance(c.contributors[0]),10000);assert.equal(c.auditLog.length,1);
});
test('voiding a fundraiser receipt is blocked if project spending depends on it',async()=>{
 const t=setup(),c=t.context;await submit(t);c.txs.push({id:'spent',fundId:'f',projectId:'p',type:'OUT',amount:60,date:'2026-02-04'});await c.voidTransaction(c.txs[0].id);assert.equal(c.txs.length,2);assert.equal(c.contributionPayments.length,1);assert.equal(c.allocationAmount('f','p'),11550);assert.match(t.alerts[0],/Cannot void/);
});
test('the project activity choice, safe cascade guard and backup invariants remain explicit',()=>{
 assert.match(html,/fundraiser-btn/);assert.match(html,/a\.fundraising&&method!=='raised'/);assert.match(html,/checkFundraisingDeletion\('project',id\)/);assert.match(html,/Fundraising receipts exceed their project allocation/);assert.match(html,/Record fundraising payments individually/);assert.match(html,/a\.fundraising\?'Fundraising for project: '/);
});

test('manual allocation cannot release funds backed by fundraising receipts',async()=>{
 const t=setup(),c=t.context;vm.runInContext(slice('function setAllocation(', 'async function assignExistingTransaction('),c);await submit(t);
 assert.equal(c.setAllocation('p','f','50'),false);assert.match(t.alerts.pop(),/fundraising receipts/);assert.equal(c.allocationAmount('f','p'),11550);
 assert.equal(c.setAllocation('p','f','100'),true);assert.equal(c.allocationAmount('f','p'),10000);
});

test('linked fundraising blocks cascaded deletion without affecting unrelated records',async()=>{
 const t=setup(),c=t.context;vm.runInContext(slice('const PENDING_DELETION_FORCE={};','function pendingDeletionBadge('),c);await submit(t);
 assert.equal(c.fundraisingBlocksDeletion('fund','f'),true);assert.equal(c.fundraisingBlocksDeletion('project','p'),true);assert.equal(c.fundraisingBlocksDeletion('contributionActivity','activity'),true);assert.equal(c.fundraisingBlocksDeletion('contributor','person'),true);assert.equal(c.fundraisingBlocksDeletion('fund','other'),false);
});

test('payments over the supported cash or allocation limits are rejected before writes',async()=>{
 const t=setup();t.context.funds[0].initialAmount=90071992547409;await submit(t);assert.equal(t.context.txs.length,0);assert.equal(t.context.contributionPayments.length,0);assert.match(t.alerts[0],/supported amount/);
});

test('fundraising cash and allocation survive full backup verification',()=>{
 assert.match(html,/t\.type!=='OUT'&&\!\(t\.type==='IN'&&t\.contributionPaymentId\)/);assert.match(html,/m\.method==='raised'/);assert.match(html,/Fundraising receipts exceed their project allocation/);assert.match(html,/A fundraising receipt must match its project, fund and income transaction/);
});

test('fundraising is reported separately from personal and fund-funded payments',async()=>{
 const t=setup(),c=t.context;vm.runInContext(slice('function contributionTotals(id)', 'function contributionDueInfo('),c);await submit(t);
 const totals=c.contributionTotals('activity');assert.equal(totals.raisedPaid,7550);assert.equal(totals.personalPaid,0);assert.equal(totals.fundPaid,0);assert.equal(totals.paid,7550);
});
