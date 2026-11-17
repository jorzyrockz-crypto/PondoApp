/* Experimental bounded expense-draft resumption for the separate
 * sparkDiscovery* fixture only. Not loaded by the app; rules and transactions
 * remain the authority. No account balance or quota guarantee is inferred. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)},validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
 function createExpenseResumer({getContext,makeDb,api,makeClient,pageSize=25,maxWallets=200}){
  const methods=['doc','collection','query','where','orderBy','documentId','limit','startAfter','getDocFromServer','getDocsFromServer'];
  if([getContext,makeDb,makeClient].some(x=>typeof x!=='function')||!api||methods.some(x=>typeof api[x]!=='function')||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50||!Number.isSafeInteger(maxWallets)||maxWallets<1||maxWallets>1000)fail('Invalid expense resumer setup');
  function context(orgId){const c=getContext();if(!c||c.memberConfirmed!==true||typeof c.uid!=='string'||!c.uid||typeof c.orgId!=='string'||!c.orgId||c.orgId!==orgId||!['owner','disbursing'].includes(c.role)||!['string','number'].includes(typeof c.scopeToken))fail('Open an authorized workspace');return {...c};}
  function current(c){const n=getContext();return !!n&&n.memberConfirmed===true&&n.uid===c.uid&&n.orgId===c.orgId&&n.role===c.role&&n.scopeToken===c.scopeToken;}
  function guard(c){if(!current(c))fail('Workspace changed; return to the original workspace');}
  async function step(c,fn){guard(c);const result=await fn();guard(c);return result;}
  function stable(s){if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Expense data is not server-confirmed');}
  function marker(s){stable(s);if(!s.exists())return 0;const n=s.data().revision;if(!Number.isSafeInteger(n)||n<1)fail('Invalid Faculty Fund revision');return n;}
  const ms=v=>v instanceof Date?v.getTime():typeof v?.toMillis==='function'?v.toMillis():NaN;
  function ref(db,c,path,id){return api.doc(db,`organizations/${c.orgId}/${path}/${id}`);}
  async function get(c,db,path,id){const s=await step(c,()=>api.getDocFromServer(ref(db,c,path,id)));stable(s);return s;}
  async function rev(c,db){return marker(await get(c,db,'sparkDiscoveryRevision','current'));}
  function validateExpense(x){
   if(!x||!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(x.status)||typeof x.createdBy!=='string'||!x.createdBy||!Number.isSafeInteger(x.amountCents)||x.amountCents<=0||!Number.isSafeInteger(x.allocatedCents)||x.allocatedCents<0||x.allocatedCents>x.amountCents||!Number.isSafeInteger(x.count)||x.count<0||x.count>200||!Number.isFinite(ms(x.occurredAt)))fail('Invalid expense record');
   if(x.status==='recorded'&&x.allocatedCents!==x.amountCents||['cancelled','voided'].includes(x.status)&&(x.allocatedCents!==0||x.count!==0))fail('Inconsistent expense record');
  }
  async function state(c,db,id){const before=await rev(c,db),s=await get(c,db,'sparkDiscoveryExpenseDrafts',id);if(!s.exists())fail('Expense not found; refresh recovery');const x=s.data();validateExpense(x);const after=await rev(c,db);if(!before||before!==after)fail('Faculty Fund changed; retry recovery');return {item:x,revision:after};}
  const result=(id,x,revision)=>({kind:'expense',id,status:x.status,remaining:['draft','cancelling','voiding'].includes(x.status),revision});
  async function allocationId(expenseId,walletId){if(!global.crypto?.subtle||typeof TextEncoder==='undefined')fail('Secure allocation IDs are unavailable');const digest=await global.crypto.subtle.digest('SHA-256',new TextEncoder().encode(expenseId+'\u0000'+walletId));return 'alloc_'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
  async function page(c,db,at,cursor,n){
   const before=await rev(c,db),constraints=[api.where('status','==','open'),api.where('acceptedAt','<=',at),api.orderBy('acceptedAt','asc'),api.orderBy(api.documentId(),'asc')];if(cursor)constraints.push(api.startAfter(cursor));constraints.push(api.limit(n));
   const snap=await step(c,()=>api.getDocsFromServer(api.query(api.collection(db,`organizations/${c.orgId}/sparkDiscoveryWallets`),...constraints)));stable(snap);if(!Array.isArray(snap.docs)||snap.docs.length>n)fail('Invalid accepted-funds page');for(const doc of snap.docs){stable(doc);if(!validId(doc.id))fail('Invalid wallet ID');}
   const after=await rev(c,db);if(before!==after||!before&&snap.docs.length)fail('Faculty Fund changed; retry recovery');return snap.docs;
  }
  async function candidate(c,db,expenseId,walletId,allocationKey,initial){
   const before=await rev(c,db),e=await get(c,db,'sparkDiscoveryExpenseDrafts',expenseId),w=await get(c,db,'sparkDiscoveryWallets',walletId),r=await get(c,db,'sparkDiscoveryRemittances',walletId),a=await get(c,db,'sparkDiscoveryAllocations',allocationKey),after=await rev(c,db);
   if(!before||before!==after)fail('Faculty Fund changed; retry recovery');if(!e.exists())fail('Expense is missing');const expense=e.data();validateExpense(expense);
   if(expense.createdBy!==initial.createdBy||expense.amountCents!==initial.amountCents||ms(expense.occurredAt)!==ms(initial.occurredAt))fail('Expense changed; review recovery');
   if(expense.status!=='draft')return {expense,revision:after};
   if(!w.exists()||!r.exists())fail('Accepted-funds record is missing');const wallet=w.data(),rem=r.data();
   if(!Number.isSafeInteger(wallet.amountCents)||wallet.amountCents<=0||!Number.isSafeInteger(wallet.unspentCents)||wallet.unspentCents<0||wallet.unspentCents>wallet.amountCents||!Number.isFinite(ms(wallet.acceptedAt)))fail('Invalid accepted funds');
   if(a.exists()){const old=a.data();if(old.expenseId!==expenseId||old.walletId!==walletId||old.releasedAt!==null)fail('Allocation history changed; review recovery');return {expense,revision:after,skip:true};}
   if(wallet.status!=='open'||rem.status!=='accepted'||rem.correctionId!==null)return {expense,revision:after,skip:true};
   if(ms(rem.acceptedAt)!==ms(wallet.acceptedAt)||wallet.amountCents!==rem.amountCents)fail('Accepted funds do not match remittance');
   if(ms(wallet.acceptedAt)>ms(expense.occurredAt)||wallet.unspentCents===0)return {expense,revision:after,skip:true};
   return {expense,revision:after,wallet};
  }
  async function resume(input){
   const c=context(input?.orgId),expenseId=input?.id;if(!validId(expenseId))fail('Invalid expense selection');const db=makeDb(c),client=makeClient(c);if(!db||!client)fail('Expense recovery unavailable');let snapshot=await state(c,db,expenseId),e=snapshot.item;if(e.status!=='draft')return result(expenseId,e,snapshot.revision);if(e.createdBy!==c.uid)fail('Only the original collector can resume this expense');const initial=e;
   let cursor=null,scanned=0;
   if(input.continuation!==undefined){
    const token=input.continuation;if(!token||token.version!==1||token.orgId!==c.orgId||token.uid!==c.uid||token.expenseId!==expenseId||!validId(token.walletId)||!Number.isSafeInteger(token.revision)||token.revision<1)fail('Invalid expense scan continuation');
    if(token.revision!==snapshot.revision)fail('Faculty Fund changed; restart the wallet scan');
    const before=await rev(c,db),s=await get(c,db,'sparkDiscoveryWallets',token.walletId),after=await rev(c,db);
    if(before!==token.revision||after!==token.revision)fail('Faculty Fund changed; restart the wallet scan');
    if(!s.exists()||s.data().status!=='open'||!Number.isFinite(ms(s.data().acceptedAt))||ms(s.data().acceptedAt)>ms(e.occurredAt))fail('Wallet scan continuation is unavailable; restart the wallet scan');cursor=s;
   }
   while(true){
    snapshot=await state(c,db,expenseId);e=snapshot.item;if(e.createdBy!==initial.createdBy||e.amountCents!==initial.amountCents||ms(e.occurredAt)!==ms(initial.occurredAt))fail('Expense changed; review recovery');if(e.status!=='draft')return result(expenseId,e,snapshot.revision);
    if(e.allocatedCents===e.amountCents){await step(c,()=>client.finalizeExpense(expenseId));const final=await state(c,db,expenseId);return result(expenseId,final.item,final.revision);}
    if(scanned>=maxWallets){
     // A continuation is only a scan hint, not a guarantee that earlier wallets
     // remain ineligible or that the expense can be funded. Never return a
     // completed status here; rules still authorize each subsequent mutation.
     return {...result(expenseId,e,snapshot.revision),reason:'scan-limit',continuation:{version:1,orgId:c.orgId,uid:c.uid,expenseId,revision:snapshot.revision,walletId:cursor.id}};
    }
    const n=Math.min(pageSize,maxWallets-scanned),wallets=await page(c,db,e.occurredAt,cursor,n);if(!wallets.length)fail('Expense remains unfinished; retry when eligible funds are available or cancel the draft.');
    for(const wallet of wallets){
     scanned++;cursor=wallet;const key=await allocationId(expenseId,wallet.id);guard(c);const checked=await candidate(c,db,expenseId,wallet.id,key,initial);e=checked.expense;if(e.status!=='draft')return result(expenseId,e,checked.revision);if(e.allocatedCents===e.amountCents)break;if(checked.skip)continue;if(e.count>=200)fail('This draft has too many allocations; cancel or review recovery.');
     const needed=e.amountCents-e.allocatedCents,value=Math.min(needed,checked.wallet.unspentCents);await step(c,()=>client.allocate(expenseId,wallet.id,key,value));
    }
    if(wallets.length<n){snapshot=await state(c,db,expenseId);e=snapshot.item;if(e.status!=='draft')return result(expenseId,e,snapshot.revision);if(e.allocatedCents<e.amountCents)fail('Expense remains unfinished; retry when eligible funds are available or cancel the draft.');}
   }
  }
  return {resume};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkExpenseResumer:createExpenseResumer};else global.createFacultyFundSparkExpenseResumer=createExpenseResumer;
})(typeof window!=='undefined'?window:globalThis);
