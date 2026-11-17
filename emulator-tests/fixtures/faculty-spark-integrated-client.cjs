'use strict';
// Emulator-only client for the integrated Spark experiment. No app imports it.
// Rules are the authority: the checks here provide readable errors and retries.
function createIntegratedClient({db,api,orgId,uid}) {
 const {doc,runTransaction,serverTimestamp}=api;
 if(!db||!orgId||!uid||orgId.includes('/'))throw Error('Missing workspace or actor');
 const ref=(name,key)=>doc(db,`organizations/${orgId}/${name}/${key}`);
 const fail=message=>{throw Error(message)};
 const identifier=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))fail('Invalid operation ID');return v};
 const amount=v=>{if(!Number.isSafeInteger(v)||v<=0||v>100000000)fail('Invalid amount');return v};
 const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('Invalid text');return v};
 const millis=t=>t instanceof Date?t.getTime():typeof t?.toMillis==='function'?t.toMillis():NaN;
 function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('Invalid date');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail('Invalid date');return v;}
 async function createPayment(paymentId,{personId,absenceDate,paymentDate,amountCents}){
  identifier(paymentId);if(typeof personId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(personId))fail('Invalid faculty member');date(absenceDate);date(paymentDate);amount(amountCents);
  const slotId=personId+'~'+absenceDate,p=ref('sparkPayments',paymentId),s=ref('sparkPaymentSlots',slotId),person=ref('sparkPeople',personId);
  return runTransaction(db,async tx=>{const [ps,ss,ms]=await Promise.all([tx.get(p),tx.get(s),tx.get(person)]);if(ps.exists()){const old=ps.data();if(old.slotId!==slotId||old.amountCents!==amountCents||old.paymentDate!==paymentDate||old.createdBy!==uid)fail('Payment ID already has different data');return {replayed:true,voided:!!old.voidedAt};}
   if(!ms.exists())fail('Faculty member not registered');if(ss.exists()&&ss.data().activePaymentId!==null)fail('An active payment already exists for this absence');
   tx.set(p,{slotId,personId,memberName:ms.data().name,absenceDate,paymentDate,amountCents,createdAt:serverTimestamp(),createdBy:uid,remittanceId:null,voidedAt:null,voidedBy:null,voidReason:null});
   if(ss.exists())tx.update(s,{activePaymentId:paymentId,revision:ss.data().revision+1});else tx.set(s,{personId,absenceDate,activePaymentId:paymentId,revision:1});return {replayed:false};
  });
 }
 async function voidPayment(paymentId,reason){identifier(paymentId);text(reason,500);const p=ref('sparkPayments',paymentId);return runTransaction(db,async tx=>{const ps=await tx.get(p);if(!ps.exists())fail('Payment missing');const old=ps.data();
  if(old.voidedAt){if(old.voidedBy!==uid||old.voidReason!==reason)fail('Payment already voided for a different reason');return {replayed:true};}
  if(old.remittanceId!==null)fail('Resolve the associated remittance before voiding this payment');const s=ref('sparkPaymentSlots',old.slotId),ss=await tx.get(s);if(!ss.exists()||ss.data().activePaymentId!==paymentId)fail('Payment slot is inconsistent');
  tx.update(p,{voidedAt:serverTimestamp(),voidedBy:uid,voidReason:reason});tx.update(s,{activePaymentId:null,revision:ss.data().revision+1});return {replayed:false};
 });}
 async function accept(remittanceId){
  const r=ref('sparkRemittances',identifier(remittanceId)),w=ref('sparkWallets',remittanceId);
  return runTransaction(db,async tx=>{const [rs,ws]=await Promise.all([tx.get(r),tx.get(w)]);if(!rs.exists())fail('Remittance unavailable');const rem=rs.data();
   if(rem.status==='accepted'&&rem.acceptedBy===uid&&ws.exists())return {replayed:true};
   if(rem.status!=='pending'||rem.presidentUid!==uid||ws.exists())fail('Remittance cannot be accepted');
   tx.update(r,{status:'accepted',acceptedBy:uid,acceptedAt:serverTimestamp()});
   tx.set(w,{status:'open',amountCents:rem.amountCents,unspentCents:rem.amountCents,acceptedAt:serverTimestamp(),revision:0,lastAllocation:null,lastRelease:null});return {replayed:false};
  });
 }
 async function createExpense(expenseId,{amountCents,description,payee,occurredAt}){
  identifier(expenseId);amount(amountCents);text(description,300);text(payee,160);if(!Number.isFinite(millis(occurredAt)))fail('Invalid expense time');const e=ref('sparkExpenseDrafts',expenseId);
  return runTransaction(db,async tx=>{const s=await tx.get(e);if(s.exists()){const old=s.data();if(old.amountCents!==amountCents||old.description!==description||old.payee!==payee||millis(old.occurredAt)!==millis(occurredAt)||old.createdBy!==uid)fail('Expense ID already has different data');return {replayed:true,status:old.status};}
   tx.set(e,{status:'draft',amountCents,allocatedCents:0,count:0,lastAllocation:null,lastRelease:null,description,payee,occurredAt,createdAt:serverTimestamp(),createdBy:uid});return {replayed:false,status:'draft'};
  });
 }
 async function allocate(expenseId,walletId,allocationId,amountCents){
  identifier(expenseId);identifier(walletId);identifier(allocationId);amount(amountCents);const e=ref('sparkExpenseDrafts',expenseId),w=ref('sparkWallets',walletId),a=ref('sparkAllocations',allocationId);
  return runTransaction(db,async tx=>{const [es,ws,as]=await Promise.all([tx.get(e),tx.get(w),tx.get(a)]);if(as.exists()){const old=as.data();if(old.expenseId!==expenseId||old.walletId!==walletId||old.amountCents!==amountCents||old.recordedBy!==uid)fail('Allocation ID already has different data');return {replayed:true,released:!!old.releasedAt};}
   if(!es.exists()||!ws.exists())fail('Expense or accepted funds are missing');const draft=es.data(),wallet=ws.data();if(draft.status!=='draft'||wallet.status!=='open'||draft.allocatedCents+amountCents>draft.amountCents||wallet.unspentCents<amountCents||millis(draft.occurredAt)<millis(wallet.acceptedAt))fail('Funds unavailable for this expense time or amount');
   tx.set(a,{expenseId,walletId,amountCents,recordedAt:serverTimestamp(),recordedBy:uid,releasedAt:null,releasedBy:null});tx.update(w,{unspentCents:wallet.unspentCents-amountCents,revision:wallet.revision+1,lastAllocation:allocationId});tx.update(e,{allocatedCents:draft.allocatedCents+amountCents,count:draft.count+1,lastAllocation:allocationId});return {replayed:false};
  });
 }
 async function finalizeExpense(expenseId){const e=ref('sparkExpenseDrafts',identifier(expenseId));return runTransaction(db,async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const draft=s.data();if(draft.status==='recorded')return {replayed:true};if(draft.status!=='draft'||draft.allocatedCents!==draft.amountCents||draft.count<1)fail('Expense allocations are incomplete');tx.update(e,{status:'recorded',recordedAt:serverTimestamp()});return {replayed:false};});}
 async function cancelExpense(expenseId,reason){const e=ref('sparkExpenseDrafts',identifier(expenseId));text(reason,500);return runTransaction(db,async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const draft=s.data();if(['cancelling','cancelled'].includes(draft.status)){if(draft.cancelReason!==reason||draft.cancelRequestedBy!==uid)fail('Expense already cancelled for a different reason');return {replayed:true,status:draft.status};}if(draft.status!=='draft')fail('Only unrecorded expenses can be cancelled');tx.update(e,{status:'cancelling',cancelReason:reason,cancelRequestedBy:uid,cancelRequestedAt:serverTimestamp()});return {replayed:false,status:'cancelling'};});}
 async function release(allocationId){const a=ref('sparkAllocations',identifier(allocationId));return runTransaction(db,async tx=>{const as=await tx.get(a);if(!as.exists())fail('Allocation missing');const line=as.data();if(line.releasedAt)return {replayed:true};const e=ref('sparkExpenseDrafts',identifier(line.expenseId)),w=ref('sparkWallets',identifier(line.walletId)),[es,ws]=await Promise.all([tx.get(e),tx.get(w)]);if(!es.exists()||!ws.exists())fail('Expense or funds missing');const draft=es.data(),wallet=ws.data();if(!['cancelling','voiding'].includes(draft.status)||wallet.status!=='open')fail('Allocation cannot be released');tx.update(a,{releasedAt:serverTimestamp(),releasedBy:uid});tx.update(e,{allocatedCents:draft.allocatedCents-line.amountCents,count:draft.count-1,lastRelease:allocationId});tx.update(w,{unspentCents:wallet.unspentCents+line.amountCents,revision:wallet.revision+1,lastRelease:allocationId});return {replayed:false};});}
 async function finishCancellation(expenseId){const e=ref('sparkExpenseDrafts',identifier(expenseId));return runTransaction(db,async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const old=s.data();if(old.status==='cancelled')return {replayed:true};if(old.status!=='cancelling'||old.allocatedCents!==0||old.count!==0)fail('Release every allocation before finishing cancellation');tx.update(e,{status:'cancelled',cancelledAt:serverTimestamp()});return {replayed:false};});}
 async function beginVoid(expenseId,reason){const e=ref('sparkExpenseDrafts',identifier(expenseId));text(reason,500);return runTransaction(db,async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const old=s.data();if(['voiding','voided'].includes(old.status)){if(old.voidReason!==reason||old.voidRequestedBy!==uid)fail('Expense already voided for a different reason');return {replayed:true,status:old.status};}if(old.status!=='recorded')fail('Only a recorded expense can be voided');tx.update(e,{status:'voiding',voidReason:reason,voidRequestedBy:uid,voidRequestedAt:serverTimestamp()});return {replayed:false,status:'voiding'};});}
 async function finishVoid(expenseId){const e=ref('sparkExpenseDrafts',identifier(expenseId));return runTransaction(db,async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const old=s.data();if(old.status==='voided')return {replayed:true};if(old.status!=='voiding'||old.allocatedCents!==0||old.count!==0)fail('Release every allocation before finishing the void');tx.update(e,{status:'voided',voidedAt:serverTimestamp()});return {replayed:false};});}
 // Read only from Firestore's server, not an offline or locally pending view.
 // Double-read the monotonic parent around the allocation query. No client may
 // treat an inconsistent view as proof that a multi-step operation completed.
 async function inspectExpense(expenseId){
  identifier(expenseId);const {collection,query,where,getDocFromServer,getDocsFromServer}=api;
  if(!collection||!query||!where||!getDocFromServer||!getDocsFromServer)fail('Server reads are unavailable');
  const parent=ref('sparkExpenseDrafts',expenseId),lines=collection(db,`organizations/${orgId}/sparkAllocations`);
  const clean=s=>{if(s.metadata?.fromCache||s.metadata?.hasPendingWrites)fail('Unconfirmed data; connect and retry');};
  const one=await getDocFromServer(parent);clean(one);if(!one.exists())fail('Expense missing');
  const result=await getDocsFromServer(query(lines,where('expenseId','==',expenseId)));clean(result);
  const two=await getDocFromServer(parent);clean(two);if(!two.exists())fail('Expense changed; reload');
  const before=one.data(),after=two.data();
  const fingerprint=x=>JSON.stringify([x.status,x.amountCents,x.allocatedCents,x.count,x.lastAllocation,x.lastRelease,x.createdBy]);
  if(fingerprint(before)!==fingerprint(after))fail('Expense changed during recovery; reload');
  if(!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(after.status)||!Number.isSafeInteger(after.amountCents)||after.amountCents<=0||!Number.isSafeInteger(after.allocatedCents)||!Number.isSafeInteger(after.count)||result.size>200)fail('Expense recovery data is invalid');
  const entries=[];let activeAmount=0,activeCount=0;
  for(const snap of result.docs){clean(snap);const row=snap.data();if(row.expenseId!==expenseId||typeof row.walletId!=='string'||!Number.isSafeInteger(row.amountCents)||row.amountCents<=0||!(row.releasedAt===null||typeof row.releasedAt?.toMillis==='function')||(row.releasedAt===null?row.releasedBy!==null:typeof row.releasedBy!=='string'))fail('Expense allocation data is invalid');
   if(row.releasedAt===null){activeAmount+=row.amountCents;activeCount++;if(!Number.isSafeInteger(activeAmount))fail('Expense allocation total is invalid');}
   entries.push({id:snap.id,walletId:row.walletId,amountCents:row.amountCents,released:row.releasedAt!==null});
  }
  if(activeAmount!==after.allocatedCents||activeCount!==after.count||activeAmount>after.amountCents)fail('Expense allocations are inconsistent; reload');
  if(after.status==='recorded'&&activeAmount!==after.amountCents)fail('Recorded expense is incomplete');
  if(['cancelled','voided'].includes(after.status)&&activeCount!==0)fail('Expense reversal is incomplete');
  return {status:after.status,amountCents:after.amountCents,allocatedCents:activeAmount,allocations:entries.sort((a,b)=>a.id.localeCompare(b.id))};
 }
 return {createPayment,voidPayment,accept,createExpense,allocate,finalizeExpense,cancelExpense,release,finishCancellation,beginVoid,finishVoid,inspectExpense};
}
module.exports={createIntegratedClient};
