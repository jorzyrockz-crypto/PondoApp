'use strict';
// Pure transition rules for a future server-authoritative Faculty Fund service.
// These helpers do not authenticate users or persist anything. A trusted server
// must load the actor's current membership/assignment and the authoritative
// state, supply its own clock/IDs, and commit each transition atomically.
const {facultyCashLedger,facultyLocalDay}=require('./faculty-fund-ledger.cjs');
const DEFAULT_ABSENCE_CENTS=25000;
const fail=message=>{throw new Error(message)};
const required=(value,label,max=160)=>{
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('Invalid '+label);
 return value.trim();
};
function day(value,label){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Invalid '+label);
 const parsed=new Date(value+'T00:00:00.000Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail('Invalid '+label);
 return value;
}
function instant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))fail('Invalid server time');
 const parsed=new Date(value);if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)fail('Invalid server time');return value;
}
function actor(value){return required(value,'actor UID',128)}
function actorName(context,fallback){return typeof context.actorName==='string'&&context.actorName.trim()?required(context.actorName,'actor name',160):fallback;}
function copy(state){
 if(!state||!Array.isArray(state.payments)||!Array.isArray(state.remittances)||!Array.isArray(state.audit)||(state.expenses!==undefined&&!Array.isArray(state.expenses))||(state.people!==undefined&&!Array.isArray(state.people)))fail('Invalid state');
 const next=structuredClone(state);if(!next.expenses)next.expenses=[];if(!next.people)next.people=[];return next;
}
function uniqueId(state,id){
 id=required(id,'ID',128);
 if(state.payments.some(p=>p.id===id)||state.remittances.some(r=>r.id===id)||state.expenses.some(e=>e.id===id)||state.people.some(p=>p.id===id))fail('Duplicate ID');
 return id;
}
function cents(value){if(!Number.isSafeInteger(value)||value<=0)fail('Invalid amount');return value;}
function sum(payments){return payments.reduce((total,p)=>{const next=total+cents(p.amountCents);if(!Number.isSafeInteger(next))fail('Amount overflow');return next},0)}
function audit(state,kind,id,uid,at,details={}){state.audit.push({kind,id,actorUid:uid,at,...details})}
function requireCollector(context){if(!context||context.memberConfirmed!==true||!['owner','disbursing'].includes(context.role))fail('Only an authorized collector can do this');return actor(context.uid)}
function requirePresident(context){if(!context||!context.presidentUid||context.uid!==context.presidentUid||context.memberConfirmed!==true)fail('Only the assigned Faculty President can do this');return actor(context.uid)}
// Faculty identities are explicit; two people may share the same name.
function addPerson(state,input,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),id=uniqueId(next,input.id);
 const name=required(input.name,'faculty name');
 next.people.push({id,name,createdAt:at,createdByUid:uid});
 audit(next,'faculty-person-added',id,uid,at);return next;
}
function addPayment(state,input,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),id=uniqueId(next,input.id);
 const personId=required(input.personId,'member ID',128),name=required(input.memberName,'member name');
 const absenceDate=day(input.absenceDate,'absence date'),paymentDate=day(input.paymentDate,'payment date');
 if(paymentDate>day(context.today,'server-local date'))fail('Payment date cannot be in the future');
 const amountCents=cents(input.amountCents??DEFAULT_ABSENCE_CENTS);
 if(next.payments.some(p=>p.personId===personId&&p.absenceDate===absenceDate&&!p.voidedAt))fail('Payment already recorded for this member and date');
 next.payments.push({id,personId,memberName:name,absenceDate,paymentDate,amountCents,receivedByUid:uid,receivedByName:actorName(context,'AO'),createdAt:at,memberReceiptPrintedAt:null});
 facultyCashLedger(next);audit(next,'payment-recorded',id,uid,at);return next;
}
function addExpense(state,input,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),id=uniqueId(next,input.id);
 const occurredAt=instant(input.occurredAt),expenseDate=facultyLocalDay(occurredAt);
 if(occurredAt>at)fail('Expense time cannot be in the future');
 const amountCents=cents(input.amountCents),description=required(input.description,'expense description',300),payee=required(input.payee,'payee');
 const reference=input.reference==null||input.reference===''?'':required(input.reference,'reference',160);
 next.expenses.push({id,date:expenseDate,occurredAt,amountCents,description,payee,reference,recordedByUid:uid,recordedByName:actorName(context,'AO'),createdAt:at});
 facultyCashLedger(next);audit(next,'expense-recorded',id,uid,at);return next;
}
function voidPayment(state,id,reason,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),p=next.payments.find(p=>p.id===id);
 if(!p||p.voidedAt)fail('Payment is unavailable');
 if(next.remittances.some(r=>['pending','accepted'].includes(r.status)&&r.paymentIds.includes(id)))fail('Cancel pending remittance or resolve accepted remittance first');
 if(at<p.createdAt)fail('Void cannot precede payment');
 const why=required(reason,'void reason',500);
 p.voidedAt=at;p.voidedByUid=uid;p.voidReason=why;
 // A correction cannot retroactively overdraw an existing recorded expense.
 facultyCashLedger(next);audit(next,'payment-voided',id,uid,at,{reason:why});return next;
}
function voidExpense(state,id,reason,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),e=next.expenses.find(e=>e.id===id);
 if(!e||e.voidedAt)fail('Expense is unavailable');
 if(at<e.createdAt)fail('Void cannot precede expense');
 const why=required(reason,'void reason',500);
 e.voidedAt=at;e.voidedByUid=uid;e.voidReason=why;
 facultyCashLedger(next);audit(next,'expense-voided',id,uid,at,{reason:why});return next;
}
function createRemittance(state,input,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),id=uniqueId(next,input.id);
 const presidentUid=actor(context.presidentUid);
 if(!Array.isArray(input.paymentIds)||!input.paymentIds.length||input.paymentIds.some(x=>typeof x!=='string'||!x)||new Set(input.paymentIds).size!==input.paymentIds.length)fail('Choose distinct payments');
 const locked=new Set(next.remittances.filter(r=>r.status==='pending'||r.status==='accepted').flatMap(r=>r.paymentIds));
 const payments=input.paymentIds.map(pid=>next.payments.find(p=>p.id===pid));
 if(payments.some(p=>!p||p.voidedAt||locked.has(p.id)))fail('Payment unavailable for remittance');
 if(payments.some(p=>p.createdAt>at))fail('Submission cannot precede payment');
 const amountCents=sum(payments);
 next.remittances.push({id,paymentIds:[...input.paymentIds],amountCents,status:'pending',submittedByUid:uid,submittedByName:actorName(context,'AO'),submittedAt:at,presidentUid,acceptedByUid:null,acceptedAt:null,declinedByUid:null,declinedAt:null,declineReason:null,receiptPrintedAt:null});
 audit(next,'remittance-submitted',id,uid,at);return next;
}
function decideRemittance(state,id,decision,context){
 const next=copy(state),uid=requirePresident(context),at=instant(context.now),r=next.remittances.find(r=>r.id===id);
 if(!r||r.status!=='pending')fail('Remittance is not pending');
 // Reassignment requires a new, explicitly addressed submission, never implicit acceptance.
 if(r.presidentUid!==uid)fail('Remittance was addressed to a different President');
 if(at<r.submittedAt)fail('Decision cannot precede submission');
 if(decision==='accept'){
  r.status='accepted';r.acceptedByUid=uid;r.acceptedByName=actorName(context,'Faculty President');r.acceptedAt=at;
  facultyCashLedger(next);
  audit(next,'remittance-accepted',id,uid,at);
 }else if(decision==='decline'){
  r.status='declined';r.declinedByUid=uid;r.declinedAt=at;r.declineReason=required(context.reason,'decline reason',500);
  audit(next,'remittance-declined',id,uid,at,{reason:r.declineReason});
 }else fail('Invalid decision');
 return next;
}
function cancelRemittance(state,id,reason,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),r=next.remittances.find(r=>r.id===id);
 if(!r||r.status!=='pending')fail('Remittance is not pending');
 if(at<r.submittedAt)fail('Cancellation cannot precede submission');
 const why=required(reason,'cancellation reason',500);
 r.status='cancelled';r.cancelledByUid=uid;r.cancelledAt=at;r.cancelReason=why;
 audit(next,'remittance-cancelled',id,uid,at,{reason:why});return next;
}
// An accepted handover is not erased: an authorized collector requests a
// correction and the currently assigned President approves or declines it.
function requestRemittanceVoid(state,id,reason,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now),r=next.remittances.find(r=>r.id===id);
 if(!r||r.status!=='accepted')fail('Remittance is not accepted');
 if(r.voidRequest)fail('A correction is already pending');
 if(at<r.acceptedAt)fail('Request cannot precede acceptance');
 const why=required(reason,'correction reason',500);
 r.voidRequest={requestedByUid:uid,requestedAt:at,reason:why};
 audit(next,'remittance-void-requested',id,uid,at,{reason:why});return next;
}
function decideRemittanceVoid(state,id,decision,context){
 const next=copy(state),uid=requirePresident(context),at=instant(context.now),r=next.remittances.find(r=>r.id===id);
 if(!r||r.status!=='accepted'||!r.voidRequest)fail('No pending remittance correction');
 if(at<r.voidRequest.requestedAt)fail('Decision cannot precede request');
 const request=r.voidRequest;
 if(decision==='approve'){
  r.status='voided';r.voidedAt=at;r.voidedByUid=uid;r.voidedByName=actorName(context,'Faculty President');r.voidReason=request.reason;r.voidRequest=null;
  // Accepted funds already used by expenses cannot be removed without first
  // reversing the dependent expense records; validate every event instant.
  facultyCashLedger(next);
  audit(next,'remittance-void-approved',id,uid,at,{reason:request.reason,requestedByUid:request.requestedByUid});
 }else if(decision==='decline'){
  const reason=required(context.reason,'decline reason',500);r.voidRequest=null;
  audit(next,'remittance-void-declined',id,uid,at,{reason,requestedByUid:request.requestedByUid});
 }else fail('Invalid decision');
 return next;
}
function acceptedRemittanceFor(state,paymentId){return state.remittances.find(r=>r.status==='accepted'&&r.paymentIds.includes(paymentId));}
// Print state is a human confirmation, never proof that a physical receipt exists.
function markReceiptPrinted(state,kind,id,context){
 const next=copy(state),uid=requireCollector(context),at=instant(context.now);
 if(kind==='member'){
  const p=next.payments.find(p=>p.id===id);
  const remittance=p&&acceptedRemittanceFor(next,id);
  if(!p||p.voidedAt||!remittance)fail('Payment is not accepted');
  if(remittance.voidRequest)fail('Remittance correction is pending');
  if(at<remittance.acceptedAt)fail('Print confirmation cannot precede acceptance');
  if(p.memberReceiptPrintedAt)fail('Receipt already marked printed');
  p.memberReceiptPrintedAt=at;p.memberReceiptPrintedByUid=uid;
 }else if(kind==='remittance'){
  const r=next.remittances.find(r=>r.id===id);
  if(!r||r.status!=='accepted')fail('Remittance is not accepted');
  if(r.voidRequest)fail('Remittance correction is pending');
  if(at<r.acceptedAt)fail('Print confirmation cannot precede acceptance');
  if(r.receiptPrintedAt)fail('Receipt already marked printed');
  r.receiptPrintedAt=at;r.receiptPrintedByUid=uid;
 }else fail('Invalid receipt type');
 audit(next,kind+'-receipt-marked-printed',id,uid,at);return next;
}
function markMemberReceiptsPrinted(state,ids,context){
 if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail('Choose distinct payments');
 // Work only on copies: any error leaves the entire input unchanged.
 return ids.reduce((next,id)=>markReceiptPrinted(next,'member',id,context),state);
}
function unprintedMemberPayments(state){
 return state.payments.filter(p=>!p.voidedAt&&!p.memberReceiptPrintedAt&&acceptedRemittanceFor(state,p.id)&&!acceptedRemittanceFor(state,p.id).voidRequest);
}
module.exports={DEFAULT_ABSENCE_CENTS,addPerson,addPayment,addExpense,voidPayment,voidExpense,createRemittance,decideRemittance,cancelRemittance,requestRemittanceVoid,decideRemittanceVoid,markReceiptPrinted,markMemberReceiptsPrinted,unprintedMemberPayments};
