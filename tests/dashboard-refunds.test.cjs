const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('overview keeps review and refund request entry without duplicate refund card',()=>{
 const dash=html.slice(html.indexOf('<!-- DASHBOARD -->'),html.indexOf('<!-- FUNDS -->'));
 assert.doesNotMatch(dash,/id="dashboardRefundCard"/);
 assert.match(dash,/id="dashboardActionsCard"/);
 assert.match(dash,/id="dashboardRequestRefundBtn"[^>]*onclick="openRefundRequest\(\)"/);
 assert.match(dash,/onclick="switchTab\('refunds'\)"/);
 const refunds=html.slice(html.indexOf('<!-- REFUND HISTORY -->'),html.indexOf('<!-- PROJECTS -->'));
 assert.match(refunds,/id="refundImpactDetails"/);assert.match(refunds,/id="requestRefundBtn"/);assert.match(refunds,/id="refundActiveList"/);
});
