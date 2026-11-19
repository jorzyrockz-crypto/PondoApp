const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function dashboardActivityEmpty('),html.indexOf('// Read-only summary of refund requests'));
test('activity empty states use distinct copy and decorative icons',()=>{
 const context=vm.createContext({});vm.runInContext(source,context);
 const payments=context.dashboardActivityEmpty('refundPayments'), transactions=context.dashboardActivityEmpty('transactions');
 assert.match(payments,/No refund payments yet/);assert.match(payments,/Recorded refund payments will appear here/);
 assert.match(transactions,/No transactions yet/);assert.match(transactions,/Income and expenses you record will appear here/);
 assert.match(payments,/aria-hidden="true"/);assert.match(transactions,/aria-hidden="true"/);
 assert.match(html,/if\(!recent\.children\.length\) recent\.innerHTML=dashboardActivityEmpty\('transactions'\)/);
 assert.match(html,/if\(!recentRefund\.children\.length\) recentRefund\.innerHTML=dashboardActivityEmpty\('refundPayments'\)/);
});
test('dashboard keeps activity history links without the removed refund card',()=>{
 assert.doesNotMatch(html,/id="dashboardRefundEmpty"/);
 assert.match(html,/class="dashboard-history-link" type="button" onclick="switchTab\('refunds'\)"/);
 assert.match(html,/class="dashboard-history-link" type="button" onclick="switchTab\('transactions'\)"/);
});
