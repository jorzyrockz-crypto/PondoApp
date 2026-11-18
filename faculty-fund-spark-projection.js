/* Experimental, not connected to Pondo. Reconcile confirmed Firestore records
 * before showing a Faculty Fund balance; never grant permissions from this
 * projection. Firestore rules remain authoritative. */
(function(global){
 'use strict';
 const fail=message=>{throw Error('Faculty Fund data is inconsistent: '+message)};
 function map(name,rows){if(!Array.isArray(rows))fail(name+' missing');const result=new Map();for(const row of rows){if(!row||typeof row.id!=='string'||!row.id||result.has(row.id))fail(name+' has invalid IDs');result.set(row.id,row)}return result;}
 function positive(v){return Number.isSafeInteger(v)&&v>0}
 function plus(a,b){const n=a+b;if(!Number.isSafeInteger(n))fail('amount overflow');return n}
 function time(v){const n=v instanceof Date?v.getTime():typeof v?.toMillis==='function'?v.toMillis():NaN;if(!Number.isFinite(n))fail('invalid timestamp');return n}
 function day(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('invalid date');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail('invalid date');return v}
 function project(input){
  // `confirmed` is a caller assertion, not a substitute for validated reads.
  // Multiple collection reads still may not form one atomic snapshot.
  if(!input||input.confirmed!==true)fail('server-confirmed data required');
  const people=map('people',input.people),payments=map('payments',input.payments),slots=map('payment slots',input.slots),remittances=map('remittances',input.remittances),lines=map('remittance lines',input.lines),wallets=map('wallets',input.wallets),expenses=map('expenses',input.expenses),allocations=map('allocations',input.allocations),corrections=map('corrections',input.corrections);
  const lineGroups=new Map(),allocationGroups=new Map(),walletUse=new Map();
  let receivedCents=0,spentCents=0,reservedCents=0,acceptedCents=0,spendableCents=0,frozenCents=0;const rows=[],pendingWork=[];
  for(const [id,p] of payments){
   const person=people.get(p.personId),slot=slots.get(p.slotId);if(!person||person.name!==p.memberName||!slot||p.slotId!==p.personId+'~'+p.absenceDate||slot.personId!==p.personId||slot.absenceDate!==p.absenceDate||!positive(p.amountCents))fail('invalid payment '+id);
   day(p.absenceDate);day(p.paymentDate);if(!p.voidedAt){if(slot.activePaymentId!==id)fail('payment slot mismatch');receivedCents=plus(receivedCents,p.amountCents);rows.push({id,type:'IN',date:p.paymentDate,amountCents:p.amountCents,memberName:p.memberName,absenceDate:p.absenceDate});}else{time(p.voidedAt);if(slot.activePaymentId===id)fail('voided payment still active');}
  }
  for(const [,slot] of slots){if(slot.activePaymentId!==null){const p=payments.get(slot.activePaymentId);if(!p||p.voidedAt||p.slotId!==slot.id)fail('payment slot has no active record');}}
  for(const [,line] of lines){const rem=remittances.get(line.remittanceId),p=payments.get(line.paymentId);if(!rem||!p||line.id!==line.remittanceId+'~'+line.paymentId||line.amountCents!==p.amountCents)fail('invalid remittance line');const list=lineGroups.get(rem.id)||[];if(list.some(x=>x.paymentId===line.paymentId))fail('duplicate remittance line');list.push(line);lineGroups.set(rem.id,list);}
  for(const [id,r] of remittances){
   const group=lineGroups.get(id)||[],wallet=wallets.get(id);if(!['draft','pending','accepted','declined','cancelled','voided'].includes(r.status)||!Array.isArray(r.paymentIds)||r.paymentIds.length<1||r.paymentIds.length>200||new Set(r.paymentIds).size!==r.paymentIds.length||!Number.isSafeInteger(r.count)||r.count!==group.length||!Number.isSafeInteger(r.amountCents)||r.amountCents<0)fail('invalid remittance '+id);
   if(group.some(x=>!r.paymentIds.includes(x.paymentId))||group.reduce((n,x)=>plus(n,x.amountCents),0)!==r.amountCents)fail('remittance total mismatch');
   if(!['draft','cancelled'].includes(r.status)&&r.count!==r.paymentIds.length)fail('incomplete submitted remittance');
   if(['draft','pending','accepted'].includes(r.status)&&group.some(x=>{const p=payments.get(x.paymentId);return p.voidedAt||p.remittanceId!==id}))fail('remittance payment link mismatch');
   if(r.status==='accepted'||r.status==='voided'){
    if(!wallet||wallet.status!==(r.status==='accepted'?'open':'voided')||wallet.amountCents!==r.amountCents||!Number.isSafeInteger(wallet.unspentCents)||wallet.unspentCents<0||wallet.unspentCents>wallet.amountCents||r.acceptedBy!==r.presidentUid||time(r.acceptedAt)!==time(wallet.acceptedAt))fail('invalid accepted-fund wallet');
    if(r.correctionId){const c=corrections.get(r.correctionId);if(!c||c.remittanceId!==id||c.status!==(r.status==='accepted'?'pending':'approved'))fail('correction mismatch');}
    if(r.status==='voided'&&wallet.unspentCents!==wallet.amountCents)fail('corrected remittance still spent');
    if(r.status==='accepted'){acceptedCents=plus(acceptedCents,r.amountCents);if(r.correctionId){frozenCents=plus(frozenCents,wallet.unspentCents);pendingWork.push({kind:'remittance-correction',id});}else spendableCents=plus(spendableCents,wallet.unspentCents);}
   }else if(wallet)fail('wallet without acceptance');
   if(r.status==='draft')pendingWork.push({kind:'remittance-draft',id});
  }
  for(const [id,w] of wallets){if(!remittances.has(id))fail('orphan wallet');if(!Number.isSafeInteger(w.revision)||w.revision<0)fail('invalid wallet revision');}
  for(const [,a] of allocations){
   const e=expenses.get(a.expenseId),w=wallets.get(a.walletId);if(!e||!w||!positive(a.amountCents)||!(a.releasedAt===null||a.releasedAt)||a.releasedAt===null&&a.releasedBy!==null)fail('invalid expense allocation');
   if(a.releasedAt){if(typeof a.releasedBy!=='string'||!a.releasedBy)fail('invalid allocation release actor');time(a.releasedAt);}else{if(w.status!=='open'||time(e.occurredAt)<time(w.acceptedAt))fail('expense precedes acceptance');walletUse.set(a.walletId,plus(walletUse.get(a.walletId)||0,a.amountCents));}
   const group=allocationGroups.get(a.expenseId)||[];group.push(a);allocationGroups.set(a.expenseId,group);
  }
  for(const [id,e] of expenses){
   if(!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(e.status)||!positive(e.amountCents)||!Number.isSafeInteger(e.allocatedCents)||e.allocatedCents<0||!Number.isSafeInteger(e.count)||e.count<0)fail('invalid expense');time(e.occurredAt);
   const group=allocationGroups.get(id)||[],active=group.filter(a=>!a.releasedAt),sum=active.reduce((n,a)=>plus(n,a.amountCents),0);if(active.length!==e.count||sum!==e.allocatedCents||sum>e.amountCents||group.length>200)fail('expense allocation mismatch');
   if(e.status==='recorded'&&sum!==e.amountCents||['voided','cancelled'].includes(e.status)&&sum!==0)fail('expense status mismatch');
   if(['recorded','voiding'].includes(e.status)){spentCents=plus(spentCents,sum);if(sum)rows.push({id,type:'OUT',occurredAt:e.occurredAt,amountCents:sum,description:e.description,payee:e.payee,status:e.status});}
   if(['draft','cancelling'].includes(e.status))reservedCents=plus(reservedCents,sum);
   if(['draft','cancelling','voiding'].includes(e.status))pendingWork.push({kind:'expense-'+e.status,id});
  }
  for(const [id,w] of wallets){if(w.unspentCents!==w.amountCents-(walletUse.get(id)||0))fail('wallet allocation mismatch');}
  const unremittedCents=receivedCents-acceptedCents,balanceCents=receivedCents-spentCents;
  if(unremittedCents<0||balanceCents<0||balanceCents!==unremittedCents+reservedCents+frozenCents+spendableCents)fail('cash totals do not reconcile');
  return {receivedCents,spentCents,balanceCents,acceptedCents,unremittedCents,spendableCents,reservedCents,frozenCents,rows,pendingWork};
 }
 if(typeof module==='object'&&module.exports)module.exports={projectFacultySpark:project};else global.projectFacultySpark=project;
})(typeof window!=='undefined'?window:globalThis);
