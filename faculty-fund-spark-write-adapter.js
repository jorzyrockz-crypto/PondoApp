/* Experimental write adapter for Pondo's Faculty Fund UI. Not connected to the
 * live app. It depends on the versioned Firestore rules and server reader. */
(function(global){
 'use strict';
 const fail=(message,code)=>{const error=new Error(message);if(code)error.code=code;throw error};
 const invalid=message=>fail(message,'functions/invalid-argument');
 const deferred=message=>fail(message,'functions/unavailable');
 const millis=value=>value instanceof Date?value.getTime():typeof value?.toMillis==='function'?value.toMillis():NaN;
 async function digest(text){if(!global.crypto?.subtle||typeof TextEncoder==='undefined')deferred('Secure request IDs are unavailable');const bytes=new Uint8Array(await global.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
 function createWriteAdapter({getContext,makeClient,makeReader}){
  if([getContext,makeClient,makeReader].some(v=>typeof v!=='function'))invalid('Invalid Faculty Fund adapter setup');
  function context(input){const c=getContext();if(!c||c.memberConfirmed!==true||!c.uid||c.orgId!==input?.orgId||!['owner','disbursing','project-manager','reviewer'].includes(c.role)||!['string','number'].includes(typeof c.scopeToken))invalid('Open a confirmed team workspace');if(typeof input.requestId!=='string'||!/^[a-f0-9]{32}$/.test(input.requestId))invalid('Invalid request ID');return {...c};}
  const same=old=>{const c=getContext();return !!c&&c.memberConfirmed===true&&c.uid===old.uid&&c.orgId===old.orgId&&c.role===old.role&&c.scopeToken===old.scopeToken};
  const guard=c=>{if(!same(c))deferred('Workspace changed; retry this request in its original workspace')};
  async function step(c,action){guard(c);const result=await action();guard(c);return result}
  const id=(prefix,requestId)=>prefix+'_'+requestId;
  async function snapshot(c){return step(c,()=>makeReader(c,()=>same(c)).read())}
  function reason(value){if(typeof value!=='string'||!value.trim()||value.length>500)invalid('A reason is required');return value.trim()}
  async function releaseBatch(c,client,remittanceId){
   const state=await snapshot(c),rem=state.records.remittances.find(r=>r.id===remittanceId);if(!rem||!['declined','cancelled','voided'].includes(rem.status))deferred('The remittance is not ready to release');
   for(const pid of rem.paymentIds){const payment=state.records.payments.find(p=>p.id===pid);if(payment?.remittanceId===remittanceId)await step(c,()=>client.releasePayment(remittanceId,pid));}
  }
  async function remittance(c,client,input){
   if(!Array.isArray(input.paymentIds)||!input.paymentIds.length||input.paymentIds.length>200||new Set(input.paymentIds).size!==input.paymentIds.length)invalid('Choose distinct payments');
   const remittanceId=id('rem',input.requestId);let result=await step(c,()=>client.createRemittance(remittanceId,input.paymentIds));
   if(result.status==='draft'){for(const paymentId of input.paymentIds)await step(c,()=>client.addPayment(remittanceId,paymentId));result=await step(c,()=>client.submitRemittance(remittanceId));}
   return {ok:true,remittanceId,status:result.status,replayed:!!result.replayed};
  }
  async function expense(c,client,input){
   if(typeof input.occurredAt!=='string')invalid('Enter the actual expense date and time');const occurredAt=new Date(input.occurredAt);if(!Number.isFinite(occurredAt.getTime())||occurredAt.toISOString()!==input.occurredAt)invalid('Invalid expense date and time');
   if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||input.amountCents>100000000||typeof input.description!=='string'||!input.description.trim()||input.description.length>300||typeof input.payee!=='string'||!input.payee.trim()||input.payee.length>160||typeof(input.reference??'')!=='string'||(input.reference??'').length>160)invalid('Invalid expense details');
   const expenseId=id('exp',input.requestId),before=await snapshot(c),existing=before.records.expenses.find(e=>e.id===expenseId);
   if(existing&&['voided','cancelled','voiding','cancelling'].includes(existing.status))deferred('This expense is being reversed; finish its recovery first');
   const occupied=new Set(before.records.allocations.filter(a=>a.expenseId===expenseId&&!a.releasedAt).map(a=>a.walletId)),remits=new Map(before.records.remittances.map(r=>[r.id,r]));
   const eligible=before.records.wallets.filter(w=>{const r=remits.get(w.id);return w.status==='open'&&w.unspentCents>0&&r?.status==='accepted'&&r.correctionId===null&&!occupied.has(w.id)&&Number.isFinite(millis(w.acceptedAt))&&millis(w.acceptedAt)<=occurredAt.getTime()}).sort((a,b)=>millis(a.acceptedAt)-millis(b.acceptedAt)||a.id.localeCompare(b.id));
   const allocated=existing?.allocatedCents||0,remaining=input.amountCents-allocated,available=eligible.reduce((n,w)=>n+w.unspentCents,0);
   if(!Number.isSafeInteger(remaining)||remaining<0||!Number.isSafeInteger(available))deferred('Expense amounts are inconsistent; reload');
   if(remaining>available){if(existing)deferred('This expense is partially allocated. Retry when funds are available or cancel the draft.');fail('Not enough accepted funds for this expense date','functions/failed-precondition');}
   const created=await step(c,()=>client.createExpense(expenseId,{amountCents:input.amountCents,description:input.description,payee:input.payee,reference:input.reference??'',occurredAt}));
   if(created.status==='recorded')return {ok:true,expenseId,replayed:true};
   let needed=remaining,count=existing?.count||0;for(const wallet of eligible){if(!needed)break;if(++count>200)deferred('This expense requires too many allocations; cancel the draft');const value=Math.min(needed,wallet.unspentCents),allocationId='alloc_'+await digest(expenseId+'\u0000'+wallet.id);guard(c);await step(c,()=>client.allocate(expenseId,wallet.id,allocationId,value));needed-=value;}
   if(needed)deferred('Expense allocations are incomplete; retry the same request');await step(c,()=>client.finalizeExpense(expenseId));return {ok:true,expenseId};
  }
  async function finishReversal(c,client,expenseId,mode){const view=await step(c,()=>client.inspectExpense(expenseId));if(view.status===mode+'ed')return;for(const line of view.allocations)if(!line.released)await step(c,()=>client.release(line.id));if(mode==='void')await step(c,()=>client.finishVoid(expenseId));else await step(c,()=>client.finishCancellation(expenseId));}
  async function transition(input){
   const c=context(input),client=makeClient(c);guard(c);if(!client)deferred('Faculty Fund is unavailable');
   try{
    switch(input.operation){
     case 'assignPresident':await step(c,()=>client.assignPresident(input.presidentUid,id('assignment',input.requestId)));return {ok:true};
     case 'registerPerson':{const personId=id('person',input.requestId);await step(c,()=>client.createPerson(personId,input.name));return {ok:true,personId};}
     case 'recordPayment':{const paymentId=id('pay',input.requestId);await step(c,()=>client.createPayment(paymentId,{personId:input.personId,absenceDate:input.absenceDate,paymentDate:input.paymentDate,amountCents:input.amountCents??25000}));return {ok:true,paymentId};}
     case 'submitRemittance':return await remittance(c,client,input);
     case 'accept':await step(c,()=>client.accept(input.remittanceId));return {ok:true};
     case 'decline':await step(c,()=>client.declineRemittance(input.remittanceId,reason(input.reason)));return {ok:true};
     case 'cancelRemittance':await step(c,()=>client.cancelRemittance(input.remittanceId,reason(input.reason)));await releaseBatch(c,client,input.remittanceId);return {ok:true};
     case 'releaseRemittancePayments':await releaseBatch(c,client,input.remittanceId);return {ok:true};
     case 'recordExpense':return await expense(c,client,input);
     case 'voidPayment':await step(c,()=>client.voidPayment(input.paymentId,reason(input.reason)));return {ok:true};
     case 'voidExpense':await step(c,()=>client.beginVoid(input.expenseId,reason(input.reason)));await finishReversal(c,client,input.expenseId,'void');return {ok:true};
     case 'requestRemittanceVoid':await step(c,()=>client.requestCorrection(id('cor',input.requestId),input.remittanceId,reason(input.reason)));return {ok:true};
     case 'approveRemittanceVoid':case 'declineRemittanceVoid':{const state=await snapshot(c),rem=state.records.remittances.find(r=>r.id===input.remittanceId);if(!rem?.correctionId)deferred('Correction is not available; reload');await step(c,()=>client.decideCorrection(rem.correctionId,input.operation==='approveRemittanceVoid'?'approved':'declined',input.operation==='declineRemittanceVoid'?reason(input.reason):''));return {ok:true};}
     case 'markMemberPrinted':{const state=await snapshot(c),p=state.records.payments.find(x=>x.id===input.paymentId);if(!p?.remittanceId)deferred('Payment is not accepted');await step(c,()=>client.confirmPrint('member',p.id,p.remittanceId));return {ok:true};}
     case 'markMemberBatchPrinted':{if(!Array.isArray(input.paymentIds)||!input.paymentIds.length||input.paymentIds.length>200||new Set(input.paymentIds).size!==input.paymentIds.length)invalid('Choose distinct payments');const state=await snapshot(c);for(const pid of input.paymentIds){const p=state.records.payments.find(x=>x.id===pid);if(!p?.remittanceId)deferred('A payment is not accepted');await step(c,()=>client.confirmPrint('member',p.id,p.remittanceId));}return {ok:true};}
     case 'markRemittancePrinted':await step(c,()=>client.confirmPrint('remittance',input.remittanceId));return {ok:true};
     default:invalid('Unknown Faculty Fund action');
    }
   }catch(error){if(error?.code?.startsWith('functions/'))throw error;const wrapped=new Error(error?.message||'Faculty Fund could not confirm the request');wrapped.code='functions/unavailable';throw wrapped;}
  }
  // Cancellation is allowed only for an existing draft/pending record. Missing
  // records are NOT treated as cancelled because a delayed write may still land.
  async function abortPending(input){
   const c=context(input),client=makeClient(c),why=reason(input.reason);guard(c);
   try{
    if(input.operation==='submitRemittance'){const remittanceId=id('rem',input.requestId),state=await snapshot(c),rem=state.records.remittances.find(r=>r.id===remittanceId);if(!rem)deferred('No confirmed draft found; retry the original request');if(['draft','pending'].includes(rem.status))await step(c,()=>client.cancelRemittance(remittanceId,why));else if(!['cancelled','declined','voided'].includes(rem.status))deferred('This remittance has already been accepted');await releaseBatch(c,client,remittanceId);return {ok:true,status:'cancelled'};}
    if(input.operation==='recordExpense'){const expenseId=id('exp',input.requestId),state=await snapshot(c),e=state.records.expenses.find(x=>x.id===expenseId);if(!e)deferred('No confirmed expense draft found; retry the original request');if(e.status==='draft'||e.status==='cancelling')await step(c,()=>client.cancelExpense(expenseId,why));else if(e.status!=='cancelled')deferred('This expense is already recorded or being voided');await finishReversal(c,client,expenseId,'cancel');return {ok:true,status:'cancelled'};}
    invalid('This request cannot be cancelled safely');
   }catch(error){if(error?.code?.startsWith('functions/'))throw error;const wrapped=new Error(error?.message||'Unable to confirm cancellation');wrapped.code='functions/unavailable';throw wrapped;}
  }
  return {transition,abortPending};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkWriteAdapter:createWriteAdapter};else global.createFacultyFundSparkWriteAdapter=createWriteAdapter;
})(typeof window!=='undefined'?window:globalThis);
