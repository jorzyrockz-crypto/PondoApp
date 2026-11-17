'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const domain=require('../faculty-fund-functions/faculty-fund-domain.cjs'),receipts=require('../faculty-fund-functions/faculty-fund-receipts.cjs');
const ao={uid:'ao',role:'disbursing',memberConfirmed:true,presidentUid:'president',actorName:'AO One',today:'2026-11-09',now:'2026-11-09T10:00:00.000Z'},president={uid:'president',presidentUid:'president',actorName:'President One',memberConfirmed:true,now:'2026-11-09T11:00:00.000Z'};
function sample(accept=true){let s={payments:[],remittances:[],audit:[]};for(const [id,name] of [['p1','Teacher <script>'],['p2','Another Teacher']])s=domain.addPayment(s,{id,personId:id,memberName:name,absenceDate:'2026-11-02',paymentDate:'2026-11-09'},ao);s=domain.createRemittance(s,{id:'r',paymentIds:['p1','p2']},ao);return accept?domain.decideRemittance(s,'r','accept',president):s;}
test('individual or combined member receipts are escaped, accepted, and side-effect free',()=>{
 const s=sample(),before=structuredClone(s),html=receipts.renderMemberReceipts(s,['p1','p2'],'School & Faculty');assert.equal((html.match(/Member payment acknowledgment<\/h1>/g)||[]).length,2);assert.match(html,/Teacher &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/School &amp; Faculty/);assert.match(html,/AO One/);assert.match(html,/President One/);assert.match(html,/₱250\.00/);assert.match(html,/Philippine time/);assert.deepEqual(s,before);
 assert.throws(()=>receipts.renderMemberReceipts(sample(false),['p1']),'not uniquely accepted');assert.throws(()=>receipts.renderMemberReceipts(s,['p1','p1']),'distinct');
});
test('remittance receipt lists all payments and verifies its total and acceptance',()=>{
 const s=sample(),html=receipts.renderRemittanceReceipt(s,'r','School');assert.match(html,/Total remitted/);assert.match(html,/₱500\.00/);assert.match(html,/Teacher &lt;script&gt;/);assert.match(html,/Another Teacher/);assert.match(html,/not an expense/);assert.throws(()=>receipts.renderRemittanceReceipt(sample(false),'r','School'),'not accepted');s.remittances[0].amountCents=1;assert.throws(()=>receipts.renderRemittanceReceipt(s,'r','School'),'does not match');
});
test('already marked receipts remain printable without resetting print state',()=>{
 let s=sample();s=domain.markReceiptPrinted(s,'member','p1',{...ao,now:'2026-11-09T12:00:00.000Z'});const html=receipts.renderMemberReceipts(s,['p1'],'School');assert.match(html,/Teacher/);assert.equal(s.payments[0].memberReceiptPrintedAt,'2026-11-09T12:00:00.000Z');
});
test('printing and confirmation are blocked while a correction is pending',()=>{
 let s=sample();s=domain.requestRemittanceVoid(s,'r','Please check',{...ao,now:'2026-11-09T12:00:00.000Z'});assert.throws(()=>receipts.renderMemberReceipts(s,['p1'],'School'),/not accepted/);assert.throws(()=>receipts.renderRemittanceReceipt(s,'r','School'),/not accepted/);assert.throws(()=>domain.markReceiptPrinted(s,'member','p1',{...ao,now:'2026-11-09T12:00:00.000Z'}),/correction is pending/);assert.equal(domain.unprintedMemberPayments(s).length,0);
});
