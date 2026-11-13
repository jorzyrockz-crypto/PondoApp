const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Refund workspace:'),html.indexOf('/* Financial reports print on paper'));
const renderer=html.slice(html.indexOf('function renderRefundHistory(){'),html.indexOf('function renderSeriesComparison()'));
test('refund workspace has responsive, scoped request cards and a dark theme',()=>{
 assert.match(css,/#tab-refunds \.refund-card-amounts \{ display:grid/);
 assert.match(css,/@media screen and \(max-width:700px\)/);
 assert.match(css,/@media screen and \(max-width:360px\)/);
 assert.match(css,/body\.dark-mode #tab-refunds \.refund-workspace \{ background:transparent!important/);
 assert.match(html,/<details class="project-detail-section refund-active-section" open>/);
 assert.match(html,/<details class="project-detail-section refund-log-section"/);
});
test('request presentation keeps calculation, escaping, receipts and the existing actions',()=>{
 for(const text of ['payableOutstanding(b)','payablePaid(bill.id)','payableStatus(bill)','escapeText(bill.reimburseTo', 'escapeText(bill.description', 'escapeText(projectLabel)', 'createdByBadge(bill)','pendingApprovalBadge(bill)','addReceiptLink(info,bill.receiptImage)','canAssignRefundProject()','assignRefundProject(bill.id,sel.value)','openPayablePayment(bill.id)','deleteUnpaidPayable(bill.id)','approveRefundRequest(bill.id)','rejectRefundRequest(bill.id)']) assert.ok(renderer.includes(text),text);
 assert.match(renderer,/remaining>0&&!bill\.pendingApproval/);
 assert.match(renderer,/if\(paid===0\)/);
 assert.match(renderer,/bill\.pendingApproval\?'pending':paid>0\?'partial':'unpaid'/);
});
test('summary and newest-first log continue to aggregate existing refund records',()=>{
 for(const action of ['request refund approval','approve refund request','reject refund request','void payable','assign refund project'])assert.ok(renderer.includes(action),action);
 assert.match(renderer,/logEntries\.sort\(\(a,b\)=>String\(b\.ts\|\|''\)\.localeCompare\(String\(a\.ts\|\|''\)\)\)/);
 assert.match(renderer,/activeBills\.filter\(b=>!b\.pendingApproval\)/);
 assert.match(renderer,/escapeText\(e\.label\)/);
 assert.match(renderer,/filter\(Boolean\)\.map\(escapeText\)/);
 assert.match(renderer,/No active refund requests/);
 assert.match(renderer,/No refund activity recorded yet/);
});
