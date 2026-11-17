'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const d=require('../faculty-fund-functions/faculty-fund-domain.cjs'),{facultyCashLedger}=require('../faculty-fund-functions/faculty-fund-ledger.cjs');
const ao={uid:'ao',role:'disbursing',memberConfirmed:true,presidentUid:'president',actorName:'AO',today:'2026-11-09',now:'2026-11-09T10:00:00.000Z'},president={uid:'president',presidentUid:'president',memberConfirmed:true,now:'2026-11-09T11:00:00.000Z'};
const base=()=>({payments:[],expenses:[],remittances:[],audit:[]});
function paid(){return d.addPayment(base(),{id:'p',personId:'person',memberName:'Teacher',absenceDate:'2026-11-05',paymentDate:'2026-11-08'},ao)}
function accepted(){let s=paid();s=d.createRemittance(s,{id:'r',paymentIds:['p']},ao);return d.decideRemittance(s,'r','accept',president)}
const laterAo={...ao,now:'2026-11-09T12:00:00.000Z'};
const expense={id:'e',occurredAt:'2026-11-09T11:30:00.000Z',amountCents:10000,description:'School activity',payee:'Supplier'};
test('cash income is recorded once, handover is not income or expense',()=>{
 let s=paid(),l=facultyCashLedger(s);assert.deepEqual([l.receivedCents,l.spentCents,l.balanceCents,l.acceptedCents,l.unremittedCents],[25000,0,25000,0,25000]);assert.equal(l.rows.length,1);
 s=d.createRemittance(s,{id:'r',paymentIds:['p']},ao);l=facultyCashLedger(s);assert.deepEqual([l.receivedCents,l.spentCents,l.balanceCents,l.acceptedCents],[25000,0,25000,0]);
 s=d.decideRemittance(s,'r','accept',president);l=facultyCashLedger(s);assert.deepEqual([l.receivedCents,l.spentCents,l.balanceCents,l.acceptedCents,l.spendableCents,l.unremittedCents],[25000,0,25000,25000,25000,0]);assert.equal(l.rows.length,1);
});
test('expense creates one cash outflow and cannot exceed accepted or dated cash',()=>{
 let s=paid();assert.throws(()=>d.addExpense(s,expense,laterAo),/accepted by the President/);s=accepted();const before=structuredClone(s);let next=d.addExpense(s,expense,laterAo);const l=facultyCashLedger(next);assert.deepEqual([l.receivedCents,l.spentCents,l.balanceCents,l.spendableCents],[25000,10000,15000,15000]);assert.deepEqual(l.rows.map(x=>x.type),['IN','OUT']);assert.deepEqual(s,before);
 assert.throws(()=>d.addExpense(s,{...expense,amountCents:25001},laterAo),/negative|exceeds/);assert.throws(()=>d.addExpense(s,{...expense,occurredAt:'2026-11-09T10:30:00.000Z'},laterAo),/accepted by the President/);assert.throws(()=>d.addExpense(s,{...expense,occurredAt:'2026-11-10T12:00:00.000Z'},laterAo),/future/);assert.throws(()=>d.addExpense(s,expense,{...ao,role:'reviewer'}),/authorized/);
});
test('void preserves audit history and cannot void a payment already submitted or accepted',()=>{
 let s=paid();assert.throws(()=>d.voidPayment(s,'p','',ao),/reason/);let v=d.voidPayment(s,'p','Mistake',ao);assert.equal(facultyCashLedger(v).balanceCents,0);assert.equal(v.payments[0].voidReason,'Mistake');assert.equal(v.audit.at(-1).kind,'payment-voided');
 s=d.createRemittance(s,{id:'r',paymentIds:['p']},ao);assert.throws(()=>d.voidPayment(s,'p','Mistake',ao),/remittance/);s=d.decideRemittance(s,'r','accept',president);assert.throws(()=>d.voidPayment(s,'p','Mistake',ao),/remittance/);
});
test('voided expense restores available cash but retains its record and audit',()=>{
 let s=d.addExpense(accepted(),expense,laterAo);s=d.voidExpense(s,'e','Wrong entry',laterAo);let l=facultyCashLedger(s);assert.equal(l.balanceCents,25000);assert.equal(l.spendableCents,25000);assert.equal(l.rows.length,1);assert.equal(s.expenses[0].voidReason,'Wrong entry');assert.throws(()=>d.voidExpense(s,'e','Again',laterAo),/unavailable/);
});
test('corrupt or duplicated acceptance cannot be counted as spendable twice',()=>{
 let s=accepted();s.remittances.push({...s.remittances[0],id:'r2'});assert.throws(()=>facultyCashLedger(s),/payment/);s=accepted();s.remittances[0].amountCents=1;assert.throws(()=>facultyCashLedger(s),/total/);
});
test('accepted totals use the actual Philippine calendar date, not the UTC day',()=>{
 let s=paid();s=d.createRemittance(s,{id:'r',paymentIds:['p']},ao);s=d.decideRemittance(s,'r','accept',{...president,now:'2026-11-09T16:30:00.000Z'});
 assert.throws(()=>d.addExpense(s,{...expense,occurredAt:'2026-11-09T15:30:00.000Z'},{...ao,now:'2026-11-09T17:00:00.000Z',today:'2026-11-10'}),/accepted by the President/);
 const n=d.addExpense(s,{...expense,occurredAt:'2026-11-09T16:45:00.000Z'},{...ao,now:'2026-11-09T17:00:00.000Z',today:'2026-11-10'});assert.equal(facultyCashLedger(n).balanceCents,15000);
});
test('expenses before acceptance on the same day are blocked even if later entered',()=>{
 const s=accepted();assert.throws(()=>d.addExpense(s,{...expense,occurredAt:'2026-11-09T10:59:59.000Z'},laterAo),/accepted by the President/);
 const approved=d.addExpense(s,{...expense,occurredAt:'2026-11-09T11:00:00.000Z'},laterAo);assert.equal(facultyCashLedger(approved).spendableCents,15000);
});
test('accepted remittance correction requires President and cannot remove money already spent',()=>{
 let s=d.addExpense(accepted(),expense,laterAo);s=d.requestRemittanceVoid(s,'r','Wrong submission',laterAo);const requested=structuredClone(s);
 assert.throws(()=>d.decideRemittanceVoid(s,'r','approve',{...president,uid:'someone',now:'2026-11-09T12:30:00.000Z'}),/President/);
 assert.throws(()=>d.decideRemittanceVoid(s,'r','approve',{...president,now:'2026-11-09T12:30:00.000Z'}),/accepted by the President/);assert.deepEqual(s,requested);
 s=d.voidExpense(s,'e','Correct dependent expense',{...laterAo,now:'2026-11-09T12:15:00.000Z'});s=d.decideRemittanceVoid(s,'r','approve',{...president,now:'2026-11-09T12:30:00.000Z'});
 assert.equal(s.remittances[0].status,'voided');assert.equal(s.remittances[0].acceptedAt,president.now);assert.equal(s.remittances[0].voidedByUid,'president');const l=facultyCashLedger(s);assert.equal(l.receivedCents,25000);assert.equal(l.unremittedCents,25000);assert.equal(l.spendableCents,0);
 s=d.createRemittance(s,{id:'r2',paymentIds:['p']},{...laterAo,now:'2026-11-09T13:00:00.000Z'});assert.equal(s.remittances[1].status,'pending');
});
test('declining a correction preserves acceptance and requires a reason',()=>{
 let s=d.requestRemittanceVoid(accepted(),'r','Please correct',laterAo);const ctx={...president,now:'2026-11-09T12:30:00.000Z'};assert.throws(()=>d.decideRemittanceVoid(s,'r','decline',ctx),/reason/);s=d.decideRemittanceVoid(s,'r','decline',{...ctx,reason:'Receipt is correct'});assert.equal(s.remittances[0].status,'accepted');assert.equal(s.remittances[0].voidRequest,null);assert.equal(s.audit.at(-1).kind,'remittance-void-declined');assert.equal(facultyCashLedger(s).spendableCents,25000);
});
