const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const ui=html.slice(html.indexOf('function openProjectDetails('),html.indexOf('function openProjectChild('));
const payables=html.slice(html.indexOf('function renderPayablesForProject('),html.indexOf('function renderPayableReport('));
const css=html.slice(html.indexOf('/* Project detail workspace:'),html.indexOf('/* Financial reports print on paper'));
test('project details scope a responsive, themed workspace without altering other modals',()=>{
 assert.match(html,/detailDialog\.classList\.toggle\('project-detail',kind\.startsWith\('Project · '\)\)/);
 assert.match(css,/\:is\(\.project-detail,\.fund-detail\) \.project-overview/);assert.match(css,/body\.dark-mode \:is\(\.project-detail,\.fund-detail\)/);
 assert.match(css,/@media \(max-width:700px\)/);assert.match(css,/@media \(max-width:360px\)/);assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/body\.role-reviewer \:is\(\.project-detail,\.fund-detail\) \.project-quick-actions/);
});
test('financial labels explain current totals, including pending requests and avoiding double counting',()=>{
 for(const v of ['fmt(t.allocated/100)','fmt(t.spent/100)','fmt(t.incurred/100)','fmt(t.unpaid/100)','fmt(t.remaining/100)','p.budget==null', 'refund requests awaiting approval','does not add the expense twice','Allocated minus cash paid', 'Includes paid bills and refunds'])assert.ok(ui.includes(v),v);
});
test('project totals continue counting direct expenses and recorded bills exactly once',()=>{
 const code=html.slice(html.indexOf('function projectTotals('),html.indexOf('function syncTxProjectChoices('));
 let c=vm.createContext({allocations:[{projectId:'p',amount:200}],payables:[{id:'bill',projectId:'p',amount:52},{id:'pending',projectId:'p',amount:10,pendingApproval:{}}],txs:[{projectId:'p',type:'OUT',amount:35,payableId:'bill'},{projectId:'p',type:'OUT',amount:65}],cents:n=>Math.round(n*100),payableOutstanding:p=>p.id==='bill'?1700:1000});vm.runInContext(code,c);
 const result=c.projectTotals('p');assert.equal(result.allocated,20000);assert.equal(result.spent,10000);assert.equal(result.remaining,10000);assert.equal(result.incurred,12700);assert.equal(result.unpaid,2700);
});
test('allocations, payables, approval, history and existing action handlers are preserved',()=>{
 for(const v of ['data-section="funding"','data-section="payables"','data-section="transactions"','data-section="history"','data-section="manage"','allocationRemaining','setAllocation(id,f','openInvoice(id)',"openInvoice(id,'advance')",'openFabSheet(\'tx\')','voidTransaction(button.dataset.txId)','payableHistoryOpen','root._payableHistoryOpen','escapeText(f?.name'])assert.ok(ui.includes(v),v);
 for(const v of ['payablePaid(bill.id)','payableOutstanding(bill)','payableStatus(bill)','createdByBadge(bill)','pendingApprovalBadge(bill)',"addReceiptLink(row.querySelector('.payable-row-info'),bill.receiptImage)",'openPayablePayment(bill.id)','deleteUnpaidPayable(bill.id)','approveRefundRequest(bill.id)','rejectRefundRequest(bill.id)','bill.pendingApproval','details.open=!!','escapeText(bill.description)'])assert.ok(payables.includes(v),v);
});
