const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),code=html.slice(html.indexOf('async function savePayablePayment()'),html.indexOf('async function deleteUnpaidPayable('));
function setup({amount='40',project=null,pending=false,available=4000,cash=10000,allocation=6000,overdraw=false}={}){
 const bill={id:'bill',kind:'advance',projectId:project,amount:75,invoiceDate:'2026-01-01',reimburseTo:'Maria',description:'Supplies',pendingApproval:pending?{}:null};
 const nodes={paymentFund:{value:'fund'},paymentAmount:{value:amount},paymentDate:{value:'2026-01-02'},paymentRef:{value:''},paymentMethod:{value:'Cash'}};
 const context={payables:[bill],funds:[{id:'fund',dateReceived:'2026-01-01'}],projects:[{id:'p'}],txs:[],payableContext:{payableId:'bill',projectId:project},document:{getElementById:id=>nodes[id]},parseMoney:v=>Math.round(Number(v)*100),validateActualDate:()=>true,payableOutstanding:()=>7500,wouldOverdrawAtDate:()=>overdraw,allocationRemaining:()=>allocation,fundCash:()=>cash,fundAvailable:()=>available,appAlert:m=>context.alerts.push(m),alerts:[],fmt:n=>'₱'+n,currentActorStamp:()=>null,makeId:()=> 'tx',closePayableModal(){},renderAll(){},returnToProjectDetail(){},soundEvent(){},trackerDB:null,storageWarningOpen:true};
 vm.createContext(context);vm.runInContext(code,context);return {c:context,bill,nodes};
}
test('project-free refund creates a single linked cash payment without touching project reserves',async()=>{
 const {c}=setup();await c.savePayablePayment();assert.equal(c.txs.length,1);assert.equal(c.txs[0].projectId,null);assert.equal(c.txs[0].payableId,'bill');assert.equal(c.txs[0].amount,40);
});
test('reserved funds, outstanding balance, date checks and unapproved refunds remain protected',async()=>{
 for(const opts of [{amount:'40.01'},{amount:'76',available:10000},{overdraw:true},{pending:true}]){const {c}=setup(opts);await c.savePayablePayment();assert.equal(c.txs.length,0);assert.ok(c.alerts.length)}
 const {c,nodes}=setup();nodes.paymentDate.value='2025-12-01';await c.savePayablePayment();assert.equal(c.txs.length,0);
});
test('a changed project or missing project cannot slip through the payment dialog',async()=>{
 let {c,bill}=setup();bill.projectId='p';await c.savePayablePayment();assert.equal(c.txs.length,0);assert.match(c.alerts[0],/project changed/i);
 ({c}=setup({project:'p'}));c.projects=[];await c.savePayablePayment();assert.equal(c.txs.length,0);
});
test('project-linked refunds still use allocation rather than uncommitted cash',async()=>{
 let {c}=setup({project:'p',amount:'60',available:0});await c.savePayablePayment();assert.equal(c.txs.length,1);assert.equal(c.txs[0].projectId,'p');
 ({c}=setup({project:'p',amount:'61',available:10000}));await c.savePayablePayment();assert.equal(c.txs.length,0);
});
test('linked payments cannot be reclassified independently or assigned a project after payment',()=>{
 const assignment=html.slice(html.indexOf('async function assignRefundProject('),html.indexOf('async function deleteFund('));assert.match(assignment,/txs\.some\(t=>t\.payableId===bill\.id\)/);
 const txAssignment=html.slice(html.indexOf('async function assignExistingTransaction('),html.indexOf('let payableContext='));assert.match(txAssignment,/t\.payableId/);assert.match(html,/!t\.projectId&&!t\.payableId&&!t\.contributionPaymentId/);
});
