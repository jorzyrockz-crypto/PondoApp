'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('Overview quick actions keep their handlers and use the requested labels',()=>{
 const actions=html.slice(html.indexOf('<div class="dashboard-hero-actions no-print">'),html.indexOf('<div id="dashboardActionsHome">'));
 for(const [label,handler] of [['Refund','openRefundRequest()'],['Transaction','openTxModal()'],['Donation','openCashDonation()'],['Death Aid','openDashboardDeathAid()']]){
  assert.ok(actions.includes(handler));assert.match(actions,new RegExp('(?:\\+|</svg>) '+label+'</button>'));
 }
 assert.match(actions,/id="dashboardOtherFunds"[^>]*onclick="openOtherPayment\(\)"[^>]*>\+ Other Funds<\/button>/);
 assert.equal((actions.match(/<button\b/g)||[]).length,5);
});
test('quick actions have distinct light and dark color treatments without altering layout',()=>{
 for(const id of ['dashboardRequestRefundBtn','recordCashDonation','dashboardRecordDeathAid','dashboardOtherFunds']){
  assert.match(html,new RegExp('#tab-dashboard #'+id+'\\{background:#[a-f0-9]+!important;border-color:#[a-f0-9]+!important;color:#[a-f0-9]+!important\\}'));
  assert.match(html,new RegExp('body\\.dark-mode #tab-dashboard #'+id+'\\{background:#[a-f0-9]+!important;border-color:#[a-f0-9]+!important;color:#[a-f0-9]+!important\\}'));
 }
 assert.match(html,/#tab-dashboard \.dashboard-hero-actions \.btn-emerald \{ background: #5b4ae8/);
 assert.match(html,/body\.role-reviewer #recordCashDonation/);assert.match(html,/body\.role-reviewer #dashboardRecordDeathAid/);
});
