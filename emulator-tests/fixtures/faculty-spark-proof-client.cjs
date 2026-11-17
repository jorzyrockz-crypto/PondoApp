'use strict';
// Emulator-only demonstrator. Not imported by Pondo; not complete or deployable.
// Firebase API is injected to allow direct testing with authenticated clients.
function createProofClient({db,api,orgId,uid}){
 const {doc,runTransaction,serverTimestamp}=api;
 if(!db||!uid||!orgId||orgId.includes('/'))throw Error('Missing workspace or user');
 const root=`organizations/${orgId}/`;
 const ref=(collection,id)=>doc(db,root+collection+'/'+id);
 const failure=message=>{throw Error(message)};
 function id(v){if(typeof v!=='string'||!/^[A-Za-z0-9_~-]{1,128}$/.test(v))failure('Invalid ID');return v;}
 async function payment({personId,absenceDate,paymentDate,amountCents}){
  id(personId);if(!/^\d{4}-\d{2}-\d{2}$/.test(absenceDate)||!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||!Number.isSafeInteger(amountCents)||amountCents<=0)failure('Invalid payment');
  const paymentId=id(personId+'~'+absenceDate),p=ref('sparkPayments',paymentId);
  return runTransaction(db,async tx=>{
   const [snapshot,person]=await Promise.all([tx.get(p),tx.get(ref('sparkPeople',personId))]);if(!person.exists())failure('Choose a registered member');if(snapshot.exists()){
    const old=snapshot.data();if(old.personId!==personId||old.absenceDate!==absenceDate||old.paymentDate!==paymentDate||old.amountCents!==amountCents||old.createdBy!==uid)failure('Payment ID already has different data');
    return {paymentId,replayed:true};
   }
   tx.set(p,{personId,memberName:person.data().name,absenceDate,paymentDate,amountCents,createdAt:serverTimestamp(),createdBy:uid,remittanceId:null});return {paymentId,replayed:false};
  });
 }
 async function draft(remittanceId){const r=ref('sparkRemittances',id(remittanceId));return runTransaction(db,async tx=>{
  const s=await tx.get(r);if(s.exists()){if(s.data().createdBy!==uid)failure('Remittance ID belongs to another actor');return {replayed:true};}
  tx.set(r,{status:'draft',amountCents:0,count:0,lastPaymentId:null,createdBy:uid,createdAt:serverTimestamp()});return {replayed:false};
 });}
 async function add(remittanceId,paymentId){const r=ref('sparkRemittances',id(remittanceId)),p=ref('sparkPayments',id(paymentId));return runTransaction(db,async tx=>{
  const [rs,ps]=await Promise.all([tx.get(r),tx.get(p)]);if(!rs.exists()||!ps.exists())failure('Missing remittance or payment');const old=rs.data(),pay=ps.data();
  if(pay.remittanceId===remittanceId)return {replayed:true};
  if(old.status!=='draft'||pay.remittanceId!==null)failure('Payment unavailable');
  tx.update(p,{remittanceId});tx.set(ref('sparkLines',remittanceId+'~'+paymentId),{remittanceId,paymentId,amountCents:pay.amountCents,linkedAt:serverTimestamp(),linkedBy:uid});tx.update(r,{lastPaymentId:paymentId,count:old.count+1,amountCents:old.amountCents+pay.amountCents});return {replayed:false};
 });}
 async function submit(remittanceId){const r=ref('sparkRemittances',id(remittanceId)),c=ref('sparkConfig','current');return runTransaction(db,async tx=>{
  const [rs,cs]=await Promise.all([tx.get(r),tx.get(c)]);if(!rs.exists()||!cs.exists())failure('Missing remittance or assignment');const old=rs.data();
  if(old.status!=='draft')return {replayed:true,status:old.status};if(!old.count)failure('Select a payment');
  tx.update(r,{status:'pending',presidentUid:cs.data().presidentUid,submittedAt:serverTimestamp()});return {replayed:false,status:'pending'};
 });}
 async function accept(remittanceId){const r=ref('sparkRemittances',id(remittanceId)),l=ref('sparkLedger','current');return runTransaction(db,async tx=>{
  const [rs,ls]=await Promise.all([tx.get(r),tx.get(l)]);if(!rs.exists()||!ls.exists())failure('Missing remittance or ledger');const old=rs.data(),balance=ls.data();
  if(old.status==='accepted'&&old.acceptedBy===uid)return {replayed:true};if(old.status!=='pending'||old.presidentUid!==uid)failure('Remittance not addressed to this President');
  tx.update(r,{status:'accepted',acceptedBy:uid,acceptedAt:serverTimestamp()});tx.update(l,{balanceCents:balance.balanceCents+old.amountCents,revision:balance.revision+1,lastKind:'accept',lastId:remittanceId,lastAcceptedAt:serverTimestamp()});return {replayed:false};
 });}
 async function expense(expenseId,amountCents,description,occurredAt){const e=ref('sparkExpenses',id(expenseId)),l=ref('sparkLedger','current');if(!Number.isSafeInteger(amountCents)||amountCents<=0||typeof description!=='string'||!description.trim()||!(occurredAt instanceof Date)||!Number.isFinite(occurredAt.getTime()))failure('Invalid expense');
  return runTransaction(db,async tx=>{
   const [es,ls]=await Promise.all([tx.get(e),tx.get(l)]);if(es.exists()){const old=es.data();if(old.createdBy!==uid||old.amountCents!==amountCents||old.description!==description||old.occurredAt.toMillis()!==occurredAt.getTime())failure('Expense ID already has different data');return {replayed:true};}
   if(!ls.exists()||ls.data().balanceCents<amountCents)failure('Not enough accepted cash');const bal=ls.data();
   tx.set(e,{amountCents,description,occurredAt,createdAt:serverTimestamp(),createdBy:uid});tx.update(l,{balanceCents:bal.balanceCents-amountCents,revision:bal.revision+1,lastKind:'expense',lastId:expenseId,lastExpenseAt:occurredAt});return {replayed:false};
  });
 }
 async function confirmPrint(kind,recordId){
  if(!['member','remittance'].includes(kind))failure('Invalid receipt kind');
  const target=ref(kind==='member'?'sparkMemberReceipts':'sparkRemittanceReceipts',id(recordId));
  return runTransaction(db,async tx=>{const s=await tx.get(target);if(s.exists())return {replayed:true};tx.set(target,{printedAt:serverTimestamp(),printedBy:uid});return {replayed:false};});
 }
 return {payment,draft,add,submit,accept,expense,confirmPrint};
}
module.exports={createProofClient};
