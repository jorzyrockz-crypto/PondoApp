/* EXPERIMENTAL targeted recovery for the sparkDiscovery* fixture. Not loaded
 * in the app. Its results are not ledger balances, and every mutation still
 * depends on matching Firestore rules and transactional client operations. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)},id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
 function createDiscoveryRecovery({getContext,makeDb,api,makeClient,makeExpenseResumer}){
  if([getContext,makeDb,makeClient].some(x=>typeof x!=='function')||makeExpenseResumer!==undefined&&typeof makeExpenseResumer!=='function'||!api||typeof api.doc!=='function'||typeof api.getDocFromServer!=='function')fail('Invalid recovery setup');
  function context(orgId){const c=getContext();if(!c||c.memberConfirmed!==true||typeof c.uid!=='string'||!c.uid||typeof c.orgId!=='string'||!c.orgId||c.orgId!==orgId||!['owner','disbursing'].includes(c.role)||!['string','number'].includes(typeof c.scopeToken))fail('Open an authorized workspace');return {...c};}
  function current(c){const n=getContext();return !!n&&n.memberConfirmed===true&&n.uid===c.uid&&n.orgId===c.orgId&&n.role===c.role&&n.scopeToken===c.scopeToken;}
  function guard(c){if(!current(c))fail('Workspace changed; return to the original workspace');}
  async function step(c,fn){guard(c);const result=await fn();guard(c);return result;}
  function stable(s){if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Recovery data is not server-confirmed');}
  function marker(s){stable(s);if(!s.exists())return 0;const n=s.data().revision;if(!Number.isSafeInteger(n)||n<1)fail('Invalid Faculty Fund revision');return n;}
  function validate(kind,x){
   if(!x||typeof x.createdBy!=='string'||!x.createdBy||!Number.isSafeInteger(x.amountCents)||x.amountCents<0)fail('Invalid recovery record');
   if(kind==='remittance'){
    if(!['draft','pending','accepted','declined','cancelled','voided'].includes(x.status)||!Array.isArray(x.paymentIds)||!x.paymentIds.length||x.paymentIds.length>200||x.paymentIds.some(p=>!id(p))||new Set(x.paymentIds).size!==x.paymentIds.length||!Number.isSafeInteger(x.count)||x.count<0||x.count>x.paymentIds.length||!Number.isSafeInteger(x.linkedCount)||x.linkedCount<0||x.linkedCount>x.count||typeof x.needsRelease!=='boolean')fail('Invalid remittance recovery record');
    const terminal=['cancelled','declined','voided'].includes(x.status);if(terminal?x.needsRelease!==(x.linkedCount>0):(x.needsRelease||x.linkedCount!==x.count))fail('Inconsistent payment release state');
    if(['pending','accepted','declined','voided'].includes(x.status)&&x.count!==x.paymentIds.length)fail('Incomplete submitted remittance');
   }else{
    if(!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(x.status)||x.amountCents<=0||!Number.isSafeInteger(x.allocatedCents)||x.allocatedCents<0||x.allocatedCents>x.amountCents||!Number.isSafeInteger(x.count)||x.count<0||x.count>200)fail('Invalid expense recovery record');
    if(x.status==='recorded'&&x.allocatedCents!==x.amountCents||['cancelled','voided'].includes(x.status)&&(x.allocatedCents!==0||x.count!==0))fail('Inconsistent expense recovery state');
   }
  }
  function remaining(kind,x){return kind==='remittance'?x.status==='draft'||x.needsRelease:['draft','cancelling','voiding'].includes(x.status);}
  function ref(db,c,path,key){return api.doc(db,`organizations/${c.orgId}/${path}/${key}`);}
  async function get(c,db,path,key){const s=await step(c,()=>api.getDocFromServer(ref(db,c,path,key)));stable(s);return s;}
  async function parent(c,db,kind,key){
   const start=marker(await get(c,db,'sparkDiscoveryRevision','current')),s=await get(c,db,kind==='remittance'?'sparkDiscoveryRemittances':'sparkDiscoveryExpenseDrafts',key);if(!s.exists())fail('Record not found; refresh recovery');const item=s.data();validate(kind,item);const end=marker(await get(c,db,'sparkDiscoveryRevision','current'));if(!start||start!==end)fail('Faculty Fund changed; refresh recovery');return {item,revision:end};
  }
  async function inspect(input){const c=context(input?.orgId);if(!['remittance','expense'].includes(input.kind)||!id(input.id))fail('Invalid recovery selection');const db=makeDb(c);if(!db)fail('Recovery unavailable');const {item,revision}=await parent(c,db,input.kind,input.id);return {kind:input.kind,id:input.id,status:item.status,remaining:remaining(input.kind,item),revision,item};}
  async function finishRemittance(c,db,client,key,item){
   if(!['declined','cancelled','voided'].includes(item.status)||!item.needsRelease)return;
   for(const paymentId of item.paymentIds){const p=await get(c,db,'sparkDiscoveryPayments',paymentId);if(!p.exists())fail('Selected payment is missing; review recovery');const link=p.data().remittanceId;if(!(link===null||typeof link==='string'))fail('Invalid payment link');if(link===key)await step(c,()=>client.releasePayment(key,paymentId));}
  }
  async function finishExpense(c,client,key,mode){
   const view=await step(c,()=>client.inspectExpense(key)),terminal=mode==='cancel'?'cancelled':'voided',working=mode==='cancel'?'cancelling':'voiding';if(view.status===terminal)return;if(view.status!==working)fail('Expense changed; refresh recovery');
   for(const line of view.allocations)if(!line.released)await step(c,()=>client.release(line.id));await step(c,()=>mode==='cancel'?client.finishCancellation(key):client.finishVoid(key));
  }
  async function resolve(input){
   const c=context(input?.orgId),kind=input?.kind,action=input?.action,key=input?.id;if(!['remittance','expense'].includes(kind)||!['resume','cancel','finish'].includes(action)||!id(key))fail('Invalid recovery selection');const db=makeDb(c),client=makeClient(c);if(!db||!client)fail('Recovery unavailable');let {item}=await parent(c,db,kind,key);
   if(action==='resume'){
    if(item.status==='draft'){
     if(item.createdBy!==c.uid)fail('Only the original collector can resume this draft');
     if(kind==='expense'){const resumer=makeExpenseResumer?.(c);if(!resumer?.resume)fail('Resuming an expense is not available; leave it pending or cancel it');await step(c,()=>resumer.resume({orgId:c.orgId,id:key}));}
     else{for(const paymentId of item.paymentIds)await step(c,()=>client.addPayment(key,paymentId));await step(c,()=>client.submitRemittance(key));}
    }
   }else if(action==='cancel'){
    if(item.status==='draft'||kind==='remittance'&&item.status==='pending'){
     if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>500)fail('A cancellation reason is required');const reason=input.reason.trim();if(kind==='remittance')await step(c,()=>client.cancelRemittance(key,reason));else await step(c,()=>client.cancelExpense(key,reason));({item}=await parent(c,db,kind,key));
    }
    if(kind==='remittance')await finishRemittance(c,db,client,key,item);else if(item.status==='cancelling')await finishExpense(c,client,key,'cancel');
   }else{
    if(kind==='remittance'&&['declined','cancelled','voided'].includes(item.status))await finishRemittance(c,db,client,key,item);
    else if(kind==='expense'&&item.status==='cancelling')await finishExpense(c,client,key,'cancel');
    else if(kind==='expense'&&item.status==='voiding')await finishExpense(c,client,key,'void');
    else if(remaining(kind,item))fail('Choose resume or cancel for a draft');
   }
   const result=await parent(c,db,kind,key);guard(c);return {kind,id:key,status:result.item.status,remaining:remaining(kind,result.item),revision:result.revision};
  }
  return {inspect,resolve};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkDiscoveryRecovery:createDiscoveryRecovery};else global.createFacultyFundSparkDiscoveryRecovery=createDiscoveryRecovery;
})(typeof window!=='undefined'?window:globalThis);
