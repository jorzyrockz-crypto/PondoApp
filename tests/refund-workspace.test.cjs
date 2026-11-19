const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Refund workspace:'),html.indexOf('/* Financial reports print on paper'));
const renderer=html.slice(html.indexOf('function renderRefundHistory(){'),html.indexOf('function renderSeriesComparison()'));
test('refund workspace has responsive, scoped request cards and a dark theme',()=>{
 assert.match(css,/#tab-refunds \.refund-card-amounts \{ display:grid/);
 assert.match(css,/#tab-refunds \.refund-workspace \{ display:grid; row-gap:16px;/);
 assert.match(css,/@media screen and \(max-width:700px\)/);
 assert.match(css,/@media screen and \(max-width:360px\)/);
 assert.match(css,/body\.dark-mode #tab-refunds \.refund-workspace \{ background:transparent!important/);
 assert.match(html,/<details id="refundActiveSection" class="project-detail-section refund-active-section" open>/);
 assert.match(html,/<details id="refundLogSection" class="project-detail-section refund-log-section"/);
});
test('request presentation keeps calculation, escaping, receipts and the existing actions',()=>{
 for(const text of ['payableOutstanding(b)','payablePaid(bill.id)','payableStatus(bill)','escapeText(bill.reimburseTo', 'escapeText(bill.description', 'escapeText(projectLabel)', 'createdByBadge(bill)','pendingApprovalBadge(bill)','addReceiptLink(info,bill.receiptImage)','canAssignRefundProject()','assignRefundProject(bill.id,sel.value)','openPayablePayment(bill.id)','deleteUnpaidPayable(bill.id)','approveRefundRequest(bill.id)','rejectRefundRequest(bill.id)']) assert.ok(renderer.includes(text),text);
 assert.match(renderer,/remaining>0&&!bill\.pendingApproval/);
 assert.match(renderer,/if\(paid===0&&credit===0\)/);
 assert.match(renderer,/bill\.pendingApproval\?'pending':paid\+credit>0\?'partial':'unpaid'/);
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

test('member and ledger requests share the active section and outcomes share the log without duplicate audit events',()=>{
 const active=html.slice(html.indexOf('<details id="refundActiveSection"'),html.indexOf('<details id="refundLogSection"'));assert.match(active,/id="memberRefundInboxList"/);assert.match(active,/id="refundActiveList"/);assert.match(renderer,/activeBills.length\+\(memberPending\?\.items.length\|\|0\)/);assert.match(renderer,/auditLog.some\(a=>a.action===action&&a.record\?\.id===r.id\)/);assert.match(renderer,/memberRefundHistorySummary/);assert.match(html,/if\(action.memberRefundHistory\)/);
});
