'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('../faculty-fund-functions/faculty-fund-domain.cjs');
const base=()=>({payments:[],remittances:[],audit:[]});
const ao={uid:'ao',role:'disbursing',memberConfirmed:true,presidentUid:'president',today:'2026-11-09',now:'2026-11-09T10:00:00.000Z'};
const president={uid:'president',presidentUid:'president',memberConfirmed:true,now:'2026-11-09T11:00:00.000Z'};
const payment=(id='p',personId='member',absenceDate='2026-11-05')=>({id,personId,memberName:'Teacher One',absenceDate,paymentDate:'2026-11-09'});
const raises=(fn,text)=>assert.throws(fn,new RegExp(text));
test('cash collection defaults to 250, records the collector and enforces date and stable-member duplicates',()=>{
 const original=base(),s=f.addPayment(original,payment(),ao);assert.equal(original.payments.length,0);assert.equal(s.payments[0].amountCents,25000);assert.equal(s.payments[0].receivedByUid,'ao');assert.equal(s.audit[0].kind,'payment-recorded');
 raises(()=>f.addPayment(s,payment('p2'),ao),'already recorded');assert.equal(f.addPayment(s,payment('p2','another'),ao).payments.length,2);
 raises(()=>f.addPayment(original,{...payment(),absenceDate:'2026-02-30'},ao),'Invalid absence');raises(()=>f.addPayment(original,{...payment(),paymentDate:'2026-11-10'},ao),'future');raises(()=>f.addPayment(original,{...payment(),amountCents:1.5},ao),'amount');raises(()=>f.addPayment(original,payment(),{...ao,role:'reviewer'}),'authorized');raises(()=>f.addPayment(original,payment(),{...ao,memberConfirmed:false}),'authorized');
});
test('remittance holds unique eligible payments and does not deduct collection cash',()=>{
 let s=f.addPayment(base(),payment(),ao);s=f.addPayment(s,payment('p2','m2'),ao);s=f.createRemittance(s,{id:'r',paymentIds:['p','p2']},ao);assert.equal(s.remittances[0].amountCents,50000);assert.equal(s.payments.reduce((n,p)=>n+p.amountCents,0),50000);assert.equal(s.remittances[0].status,'pending');
 raises(()=>f.createRemittance(s,{id:'r2',paymentIds:['p']},ao),'unavailable');raises(()=>f.createRemittance(s,{id:'r2',paymentIds:['p','p']},ao),'distinct');raises(()=>f.createRemittance(s,{id:'r2',paymentIds:['missing']},ao),'unavailable');
});
test('only currently assigned and addressed President can accept with trusted time',()=>{
 let s=f.createRemittance(f.addPayment(base(),payment(),ao),{id:'r',paymentIds:['p']},ao);
 for(const wrong of [{...president,uid:'other'},{...president,memberConfirmed:false},{...president,presidentUid:'other',uid:'other'}])raises(()=>f.decideRemittance(s,'r','accept',wrong),'President');
 s=f.decideRemittance(s,'r','accept',president);assert.equal(s.remittances[0].acceptedAt,president.now);assert.equal(s.remittances[0].acceptedByUid,'president');raises(()=>f.decideRemittance(s,'r','accept',president),'not pending');
});
test('decline requires reason and makes payments eligible for resubmission',()=>{
 let s=f.createRemittance(f.addPayment(base(),payment(),ao),{id:'r',paymentIds:['p']},ao);raises(()=>f.decideRemittance(s,'r','decline',president),'reason');s=f.decideRemittance(s,'r','decline',{...president,reason:'Wrong batch'});assert.equal(s.remittances[0].status,'declined');assert.equal(s.audit.at(-1).reason,'Wrong batch');s=f.createRemittance(s,{id:'r2',paymentIds:['p']},ao);assert.equal(s.remittances[1].status,'pending');
});
test('member and remittance print confirmations are independent and require acceptance',()=>{
 let s=f.createRemittance(f.addPayment(base(),payment(),ao),{id:'r',paymentIds:['p']},ao);raises(()=>f.markReceiptPrinted(s,'member','p',ao),'not accepted');raises(()=>f.markReceiptPrinted(s,'remittance','r',ao),'not accepted');s=f.decideRemittance(s,'r','accept',president);assert.equal(f.unprintedMemberPayments(s).length,1);const printer={...ao,now:'2026-11-09T12:00:00.000Z'};s=f.markReceiptPrinted(s,'member','p',printer);assert.equal(f.unprintedMemberPayments(s).length,0);assert.equal(s.remittances[0].receiptPrintedAt,null);s=f.markReceiptPrinted(s,'remittance','r',printer);assert.equal(s.remittances[0].receiptPrintedAt,printer.now);raises(()=>f.markReceiptPrinted(s,'member','p',printer),'already');
});

test('batch member print confirmation is all-or-nothing and does not mark remittance',()=>{
 let s=f.addPayment(base(),payment(),ao);s=f.addPayment(s,payment('p2','m2'),ao);s=f.createRemittance(s,{id:'r',paymentIds:['p','p2']},ao);s=f.decideRemittance(s,'r','accept',president);const printer={...ao,now:'2026-11-09T12:00:00.000Z'};
 raises(()=>f.markMemberReceiptsPrinted(s,['p','missing'],printer),'not accepted');assert.equal(s.payments[0].memberReceiptPrintedAt,null);
 raises(()=>f.markMemberReceiptsPrinted(s,['p','p'],printer),'distinct');
 const next=f.markMemberReceiptsPrinted(s,['p','p2'],printer);assert.equal(f.unprintedMemberPayments(next).length,0);assert.equal(next.remittances[0].receiptPrintedAt,null);assert.equal(s.payments[0].memberReceiptPrintedAt,null);
});
test('trusted timestamps cannot precede the event being confirmed',()=>{
 let s=f.createRemittance(f.addPayment(base(),payment(),ao),{id:'r',paymentIds:['p']},ao);raises(()=>f.decideRemittance(s,'r','accept',{...president,now:'2026-11-09T09:00:00.000Z'}),'precede');s=f.decideRemittance(s,'r','accept',president);raises(()=>f.markReceiptPrinted(s,'member','p',ao),'precede');
});
