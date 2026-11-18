/* Isolated bridge from discovery pages to the experimental recovery screen.
 * Not loaded by Pondo. Matches sparkDiscovery* fixture only. The host must
 * reset on every auth, membership, role or workspace change. Rules authorize
 * writes; a page or inspection is not a lock and is not a ledger audit. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)},id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
 const millis=x=>x instanceof Date?x.getTime():typeof x?.toMillis==='function'?x.toMillis():NaN;
 const iso=x=>{const t=millis(x);if(!Number.isFinite(t))fail('Invalid recovery timestamp');return new Date(t).toISOString();};
 function createPagedRecovery({getContext,makeDb,api,makeDiscovery,makeResolver,supportsExpenseResume=false}){
  if([getContext,makeDb,makeDiscovery,makeResolver].some(x=>typeof x!=='function')||!api||typeof api.doc!=='function'||typeof api.getDocFromServer!=='function'||typeof supportsExpenseResume!=='boolean')fail('Invalid paged recovery setup');
  const ctx=getContext();if(!ctx||ctx.memberConfirmed!==true||typeof ctx.uid!=='string'||!ctx.uid||typeof ctx.orgId!=='string'||!ctx.orgId||!['owner','disbursing'].includes(ctx.role)||!['string','number'].includes(typeof ctx.scopeToken))fail('Open an authorized workspace');const c={...ctx},db=makeDb(c);if(!db)fail('Recovery unavailable');
  const same=()=>{const x=getContext();return !!x&&x.memberConfirmed===true&&x.orgId===c.orgId&&x.uid===c.uid&&x.role===c.role&&x.scopeToken===c.scopeToken;};
  let generation=0,busy=false,index=0,broken=false;const categories=['draftRemittances','releaseRemittances','expenses'],discovery=makeDiscovery(c,same,1),resolver=makeResolver(c);if(!discovery?.next||!discovery?.reset||!resolver?.inspect||!resolver?.resolve)fail('Recovery unavailable');
  const guard=g=>{if(g!==generation||!same())fail('Workspace changed; restart recovery');};
  const stable=s=>{if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Recovery data is not server-confirmed');};
  async function get(g,path,key){guard(g);const s=await api.getDocFromServer(api.doc(db,`organizations/${c.orgId}/${path}/${key}`));guard(g);stable(s);return s;}
  function reset(){generation++;index=0;busy=false;broken=false;discovery.reset();}
  async function details(g,entry,revision,category){
   if(!entry||!id(entry.id))fail('Invalid recovery selection');const kind=category==='expenses'?'expense':'remittance',view=await resolver.inspect({orgId:c.orgId,kind,id:entry.id});guard(g);if(!view||view.revision!==revision||view.remaining!==true||view.kind!==kind||view.id!==entry.id)fail('Faculty Fund changed; restart recovery');const x=view.item;
   if(!x||typeof x.createdBy!=='string'||!x.createdBy||!Number.isSafeInteger(x.amountCents)||x.amountCents<0)fail('Invalid recovery record');
   const base={kind,id:entry.id,status:x.status,createdBy:x.createdBy,createdAt:iso(x.createdAt),amountCents:x.amountCents,remaining:true,canResume:x.status==='draft'&&x.createdBy===c.uid};
   if(kind==='expense'){
    if(!['draft','cancelling','voiding'].includes(x.status)||typeof x.description!=='string'||typeof x.payee!=='string'||typeof x.reference!=='string'||!Number.isSafeInteger(x.allocatedCents)||x.allocatedCents<0||x.allocatedCents>x.amountCents)fail('Invalid expense recovery');
    return {...base,canResume:base.canResume&&supportsExpenseResume,description:x.description,payee:x.payee,reference:x.reference,occurredAt:iso(x.occurredAt),allocatedCents:x.allocatedCents};
   }
   if(!['draft','cancelled','declined','voided'].includes(x.status)||!Array.isArray(x.paymentIds)||!x.paymentIds.length||x.paymentIds.length>200||x.paymentIds.some(p=>!id(p))||new Set(x.paymentIds).size!==x.paymentIds.length||!Number.isSafeInteger(x.linkedCount)||x.linkedCount<0||x.linkedCount>x.paymentIds.length)fail('Invalid remittance recovery');
   const payments=[];let available=true,linked=0;for(const pid of x.paymentIds){const s=await get(g,'sparkDiscoveryPayments',pid);if(!s.exists()){payments.push({id:pid,missing:true});available=false;continue;}const p=s.data();if(!p||typeof p.memberName!=='string'||!p.memberName||typeof p.absenceDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.absenceDate)||!Number.isSafeInteger(p.amountCents)||p.amountCents<=0||!(p.remittanceId===null||id(p.remittanceId)))fail('Invalid selected payment');const attached=p.remittanceId===entry.id;if(attached)linked++;if(p.voidedAt||p.remittanceId!==null&&!attached)available=false;payments.push({id:pid,memberName:p.memberName,absenceDate:p.absenceDate,amountCents:p.amountCents,linked:attached});}
   if(payments.every(p=>!p.missing)&&linked!==x.linkedCount)fail('Linked payment count changed; restart recovery');
   const end=await get(g,'sparkDiscoveryRevision','current');if(!end.exists()||end.data().revision!==revision)fail('Faculty Fund changed; restart recovery');
   return {...base,canResume:base.canResume&&available,linkedCount:x.linkedCount,payments};
  }
  async function list(input){
   if(input?.orgId!==c.orgId||!same())fail('Open the original workspace');if(busy)fail('Recovery is already loading');if(broken)fail('Refresh recovery before continuing');const g=generation;busy=true;
   try{const category=categories[index];if(!category)fail('Refresh recovery before continuing');const page=await discovery.next(category);guard(g);if(!page||page.category!==category||!Array.isArray(page.items)||page.items.length>1||typeof page.hasMore!=='boolean'||typeof page.complete!=='boolean'||!Number.isSafeInteger(page.revision))fail('Invalid recovery page');const items=[];for(const x of page.items)items.push(await details(g,x,page.revision,category));guard(g);if(!page.hasMore)index++;if(page.complete!==(index===categories.length))fail('Invalid recovery page completion');return {paged:true,category,revision:page.revision,items,complete:page.complete,hasMore:!page.complete};}
   catch(e){if(g===generation)broken=true;throw e;}finally{if(g===generation)busy=false;}
  }
  async function resolve(input){if(input?.orgId!==c.orgId||!same())fail('Open the original workspace');if(busy)fail('Recovery is already loading');const g=generation;busy=true;try{const out=await resolver.resolve(input);guard(g);return out;}finally{if(g===generation)reset();}}
  return {list,resolve,reset};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkPagedRecovery:createPagedRecovery};else global.createFacultyFundSparkPagedRecovery=createPagedRecovery;
})(typeof window!=='undefined'?window:globalThis);
