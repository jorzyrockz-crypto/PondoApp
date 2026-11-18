/* Experimental bounded recovery discovery. Requires ONLY the matching
 * discovery-proof rules and client option; previous fixtures lack the required
 * release counter. Not a balance, authorization boundary or production code.
 * Every page and category is pinned to one revision; admin writes bypass rules. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function createDiscovery({db,api,orgId,isCurrent,pageSize=25}){
  const methods=['doc','collection','query','where','orderBy','documentId','limit','startAfter','getDocFromServer','getDocsFromServer'];
  if(!db||!api||methods.some(m=>typeof api[m]!=='function')||typeof orgId!=='string'||!orgId||orgId.includes('/')||typeof isCurrent!=='function'||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)fail('Invalid recovery discovery setup');
  const root=`organizations/${orgId}`,categories={draftRemittances:{path:'sparkDiscoveryRemittances',field:'status',op:'==',value:'draft'},releaseRemittances:{path:'sparkDiscoveryRemittances',field:'needsRelease',op:'==',value:true},expenses:{path:'sparkDiscoveryExpenseDrafts',field:'status',op:'in',value:['draft','cancelling','voiding']}};
  let pinned=null,busy=false,generation=0,state={};
  function reset(){generation++;pinned=null;busy=false;state={};for(const k of Object.keys(categories))state[k]={cursor:null,finished:false};}reset();
  const stable=s=>{if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Recovery discovery is not server-confirmed');};
  const guard=g=>{if(g!==generation||!isCurrent())fail('Workspace changed; restart recovery discovery');};
  function marker(s){stable(s);if(!s.exists())return 0;const n=s.data().revision;if(!Number.isSafeInteger(n)||n<1)fail('Invalid Faculty Fund revision');return n;}
  function validate(s,category){
   stable(s);const x=s.data(),ms=v=>v instanceof Date?v.getTime():typeof v?.toMillis==='function'?v.toMillis():NaN;
   if(typeof s.id!=='string'||!s.id||!x||typeof x.createdBy!=='string'||!x.createdBy||!Number.isFinite(ms(x.createdAt))||!Number.isSafeInteger(x.amountCents)||x.amountCents<0)fail('Invalid recovery record');
   if(category==='expenses'){
    if(!['draft','cancelling','voiding'].includes(x.status)||x.amountCents<=0||!Number.isSafeInteger(x.allocatedCents)||x.allocatedCents<0||x.allocatedCents>x.amountCents||typeof x.description!=='string'||typeof x.payee!=='string'||!Number.isFinite(ms(x.occurredAt)))fail('Invalid expense recovery');
   }else{
    if(!Array.isArray(x.paymentIds)||x.paymentIds.length<1||x.paymentIds.length>200||new Set(x.paymentIds).size!==x.paymentIds.length||!Number.isSafeInteger(x.count)||x.count<0||x.count>x.paymentIds.length||!Number.isSafeInteger(x.linkedCount)||x.linkedCount<0||x.linkedCount>x.count||typeof x.needsRelease!=='boolean')fail('Invalid remittance recovery');
    if(category==='draftRemittances'&&(x.status!=='draft'||x.needsRelease!==false||x.linkedCount!==x.count))fail('Invalid remittance draft');
    if(category==='releaseRemittances'&&(!['cancelled','declined','voided'].includes(x.status)||x.needsRelease!==true||x.linkedCount<1))fail('Invalid remittance release');
   }
   return {...x,id:s.id};
  }
  async function next(category){
   if(!Object.hasOwn(categories,category))fail('Unknown recovery category');if(busy)fail('Recovery discovery is already loading');const g=generation;guard(g);busy=true;
   try{
    const before=marker(await api.getDocFromServer(api.doc(db,`${root}/sparkDiscoveryRevision/current`)));guard(g);if(pinned!==null&&pinned!==before)fail('Faculty Fund changed; restart recovery discovery');
    if(state[category].finished)return {revision:before,category,items:[],hasMore:false,complete:Object.values(state).every(x=>x.finished)};
    const spec=categories[category],constraints=[api.where(spec.field,spec.op,spec.value),api.orderBy(api.documentId(),'asc')];if(state[category].cursor)constraints.push(api.startAfter(state[category].cursor));constraints.push(api.limit(pageSize+1));
    const snap=await api.getDocsFromServer(api.query(api.collection(db,`${root}/${spec.path}`),...constraints));guard(g);stable(snap);if(!Array.isArray(snap.docs)||snap.docs.length>pageSize+1)fail('Invalid recovery page');const items=snap.docs.map(x=>validate(x,category)),after=marker(await api.getDocFromServer(api.doc(db,`${root}/sparkDiscoveryRevision/current`)));guard(g);
    if(before!==after)fail('Faculty Fund changed; restart recovery discovery');if(before===0&&items.length)fail('Faculty Fund revision is missing');const hasMore=items.length>pageSize,visible=items.slice(0,pageSize);
    pinned=before;state[category].cursor=visible.length?snap.docs[visible.length-1]:state[category].cursor;state[category].finished=!hasMore;
    return {revision:before,category,items:visible,hasMore,complete:Object.values(state).every(x=>x.finished)};
   }finally{if(g===generation)busy=false;}
  }
  return {next,reset};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkDiscovery:createDiscovery};else global.createFacultyFundSparkDiscovery=createDiscovery;
})(typeof window!=='undefined'?window:globalThis);
