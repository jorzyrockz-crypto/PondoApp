'use strict';
// Faculty Fund-only cash projection. Not connected to Pondo's existing fund
// snapshots, project allocations, transaction UI, reports or backup system.
// Amounts are integer centavos. Remittances are handovers, not cash movements.
function amount(value){if(!Number.isSafeInteger(value)||value<=0)throw Error('Invalid ledger amount');return value;}
function date(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Invalid ledger date');
 const d=new Date(value+'T00:00:00.000Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('Invalid ledger date');return value;
}
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n))throw Error('Ledger amount overflow');return n;}
function localDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))throw Error('Invalid acceptance time');
 const d=new Date(value);if(!Number.isFinite(d.getTime())||d.toISOString()!==value)throw Error('Invalid acceptance time');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
function ledger(state){
 if(!state||!Array.isArray(state.payments)||!Array.isArray(state.remittances)||!Array.isArray(state.expenses??[]))throw Error('Invalid ledger state');
 const rows=[];
 for(const p of state.payments){if(p.voidedAt)continue;rows.push({id:p.id,type:'IN',date:date(p.paymentDate),amountCents:amount(p.amountCents),description:'Absence payment',memberName:p.memberName,absenceDate:p.absenceDate,recordedByUid:p.receivedByUid});}
 for(const e of state.expenses||[]){if(e.voidedAt)continue;rows.push({id:e.id,type:'OUT',date:date(e.date),amountCents:amount(e.amountCents),description:e.description,payee:e.payee,reference:e.reference,occurredAt:e.occurredAt,recordedByUid:e.recordedByUid});}
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 let receivedCents=0,spentCents=0,balance=0;const days=new Map();
 for(const row of rows){if(row.type==='IN'){receivedCents=add(receivedCents,row.amountCents);days.set(row.date,add(days.get(row.date)||0,row.amountCents));}else{spentCents=add(spentCents,row.amountCents);days.set(row.date,add(days.get(row.date)||0,-row.amountCents));}}
 // Within a date there is no known time/order, so validate the day net,
 // matching the app's date-based cash checks, not an imagined event sequence.
 for(const [,net] of days){balance=add(balance,net);if(balance<0)throw Error('Faculty Fund cash would be negative on a recorded date');}
 // Until custody/authority for pre-handover spending is specified, expenses
 // may use only funds in accepted remittances. This keeps the AO's
 // unremitted collection from being both spent and later handed over.
 const receivedById=new Map(state.payments.filter(p=>!p.voidedAt).map(p=>[p.id,p])),acceptedIds=new Set(),availableInstants=new Map();
 let acceptedCents=0;
 for(const r of state.remittances.filter(r=>r.status==='accepted')){
  if(!Array.isArray(r.paymentIds)||!r.paymentIds.length||r.acceptedByUid!==r.presidentUid)throw Error('Invalid accepted remittance');
  localDay(r.acceptedAt);let remittanceTotal=0;
  for(const id of r.paymentIds){
   const p=receivedById.get(id);if(!p||acceptedIds.has(id))throw Error('Invalid accepted remittance payment');
   acceptedIds.add(id);remittanceTotal=add(remittanceTotal,amount(p.amountCents));
  }
  if(remittanceTotal!==r.amountCents)throw Error('Invalid accepted remittance total');
  acceptedCents=add(acceptedCents,remittanceTotal);availableInstants.set(r.acceptedAt,add(availableInstants.get(r.acceptedAt)||0,remittanceTotal));
 }
 for(const row of rows.filter(r=>r.type==='OUT')){
  if(localDay(row.occurredAt)!==row.date)throw Error('Expense date does not match its recorded time');
  availableInstants.set(row.occurredAt,add(availableInstants.get(row.occurredAt)||0,-row.amountCents));
 }
 let spendableCents=0;
 for(const [,net] of [...availableInstants.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){spendableCents=add(spendableCents,net);if(spendableCents<0)throw Error('Expense exceeds Faculty Fund cash accepted by the President on a recorded date');}
 return {rows,receivedCents,spentCents,balanceCents:balance,acceptedCents,spendableCents,unremittedCents:receivedCents-acceptedCents};
}
module.exports={facultyCashLedger:ledger,facultyLocalDay:localDay};
