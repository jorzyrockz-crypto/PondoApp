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
 async function release(allocationId){const a=ref('sparkAllocations',identifier(allocationId));return runTransaction(db,async tx=>{const as=await tx.get(a);if(!as.exists())fail('Allocation missing');const line=as.data();if(line.releasedAt)return {replayed:true};const e=ref('sparkExpenseDrafts',identifier(line.expenseId)),w=ref('sparkWallets',identifier(line.walletId)),[es,ws]=await Promise.all([tx.get(e),tx.get(w)]);if(!es.exists()||!ws.exists())fail('Expense or funds missing');const draft=es.data(),wallet=ws.data();if(draft.status!=='cancelling'||wallet.status!=='open')fail('Allocation cannot be released');tx.update(a,{releasedAt:serverTimestamp(),releasedBy:uid});tx.update(e,{allocatedCents:draft.allocatedCents-line.amountCents,count:draft.count-1,lastRelease:allocationId});tx.update(w,{unspentCents:wallet.unspentCents+line.amountCents,revision:wallet.revision+1,lastRelease:allocationId});return {replayed:false};});}
 async function finishCancellation(expenseId){const e=ref('sparkExpenseDrafts',identifier(expenseId));return runTransaction(db,async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const old=s.data();if(old.status==='cancelled')return {replayed:true};if(old.status!=='cancelling'||old.allocatedCents!==0||old.count!==0)fail('Release every allocation before finishing cancellation');tx.update(e,{status:'cancelled',cancelledAt:serverTimestamp()});return {replayed:false};});}
 return {accept,createExpense,allocate,finalizeExpense,cancelExpense,release,finishCancellation};
}
module.exports={createIntegratedClient};
