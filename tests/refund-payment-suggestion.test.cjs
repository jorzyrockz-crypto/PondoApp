const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('function suggestedRefundPayment('),html.indexOf('async function savePayable(){'));
function setup({outstanding=100000,allocation=60000,cash=80000,historical=50000,kind='advance',pendingApproval=null,date='2026-05-15',fund='fund'}={}){
 const bill={id:'bill',kind,projectId:'project',invoiceDate:'2026-05-01',pendingApproval},nodes={paymentFund:{value:fund,options:[{},{}]},paymentDate:{value:date},paymentAmount:{value:''},paymentNote:{textContent:''},paymentSuggested:{style:{display:'none'}}};
 const context={bill,payables:[bill],funds:[{id:'fund',dateReceived:'2026-04-01'}],payableContext:{payableId:'bill'},document:{getElementById:id=>nodes[id]},localDate:()=>'2026-06-01',payableOutstanding:()=>outstanding,allocationRemaining:()=>allocation,fundCash:()=>cash,wouldOverdrawAtDate:(id,d,n)=>n>historical,fmt:n=>'₱'+n.toFixed(2),paymentAmountEdited:false};
 vm.createContext(context);vm.runInContext(code,context);return {c:context,n:nodes};
}
test('refund suggestion is capped by outstanding, allocation, cash and later balances',()=>{
 for(const [opts,expected] of [[{outstanding:12345,allocation:30000,cash:50000,historical:50000},12345],[{outstanding:50000,allocation:12345,cash:50000,historical:50000},12345],[{outstanding:50000,allocation:50000,cash:12345,historical:50000},12345],[{outstanding:50000,allocation:50000,cash:50000,historical:12345},12345]]){
  const {c,n}=setup(opts);assert.equal(c.suggestedRefundPayment(c.bill,'fund','2026-05-15'),expected);c.updatePaymentNote();assert.equal(n.paymentAmount.value,'123.45');assert.match(n.paymentNote.textContent,/Suggested maximum/);
 }
});
test('invalid dates, missing funds, pending requests and zero availability do not suggest a payment',()=>{
 for(const opts of [{date:'2026-04-30'},{date:'2026-06-02'},{date:''},{fund:''},{cash:0},{allocation:0},{historical:0},{pendingApproval:{}}]){const {c,n}=setup(opts);c.updatePaymentNote();assert.equal(n.paymentAmount.value,'');}
});
test('edited amounts survive fund and date changes and can be reset to the latest suggestion',()=>{
 const {c,n}=setup();c.updatePaymentNote();assert.equal(n.paymentAmount.value,'500.00');n.paymentAmount.value='75.00';c.paymentAmountEdited=true;n.paymentDate.value='2026-05-16';c.updatePaymentNote();assert.equal(n.paymentAmount.value,'75.00');assert.equal(n.paymentSuggested.style.display,'inline-flex');c.useSuggestedPayablePayment();assert.equal(n.paymentAmount.value,'500.00');assert.equal(n.paymentSuggested.style.display,'none');
});
test('project expense payments remain manually entered, and save-time checks remain intact',()=>{
 const {c,n}=setup({kind:'expense'});c.updatePaymentNote();assert.equal(n.paymentAmount.value,'');assert.match(n.paymentNote.textContent,/Unspent allocation/);
 const save=html.slice(html.indexOf('async function savePayablePayment()'),html.indexOf('function renderPayablesForProject('));
 for(const check of ['bill.pendingApproval','validateActualDate(date','date<bill.invoiceDate','dateReceived','amount>payableOutstanding(bill)','wouldOverdrawAtDate(fundId,date,amount)','allocationRemaining(fundId,bill.projectId)','fundCash(fundId)'])assert.ok(save.includes(check),check);
 assert.match(html,/bill\.kind==='advance'&&eligibleFunds\.length===1/);
});
