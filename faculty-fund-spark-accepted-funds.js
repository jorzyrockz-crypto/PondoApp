/* Experimental discovery-fixture reader, not connected to the app.
 * Summarizes remaining accepted wallets, NOT total cash, a report, an audit,
 * or permission to spend. Matching rules and revision are essential; Admin
 * writes bypass both. Expense timing and later changes may limit spending. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function createAcceptedFundsPager({db,api,orgId,isCurrent,pageSize=25}){
  const methods=['doc','collection','query','where','orderBy','documentId','limit','startAfter','getDocFromServer','getDocsFromServer'];
  if(!db||!api||methods.some(m=>typeof api[m]!=='function')||typeof orgId!=='string'||!orgId||orgId.includes('/')||typeof isCurrent!=='function'||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)fail('Invalid accepted-funds reader setup');
  const root=`organizations/${orgId}`,ref=(path,id)=>api.doc(db,`${root}/${path}/${id}`);
  let generation=0,pinned=null,cursor=null,finished=false,busy=false,totals={walletCount:0,unfrozenCents:0,frozenCents:0};
  function reset(){generation++;pinned=null;cursor=null;finished=false;busy=false;totals={walletCount:0,unfrozenCents:0,frozenCents:0};}
  const guard=g=>{if(g!==generation||!isCurrent())fail('Workspace changed; restart accepted funds');};
  const stable=s=>{if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Accepted funds are not server-confirmed');};
  async function get(g,path,id){guard(g);const s=await api.getDocFromServer(ref(path,id));guard(g);stable(s);return s;}
  function marker(s){stable(s);if(!s.exists())return 0;const n=s.data().revision;if(!Number.isSafeInteger(n)||n<1)fail('Invalid Faculty Fund revision');return n;}
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  function add(a,b){const n=a+b;if(!Number.isSafeInteger(n))fail('Accepted funds amount overflow');return n;}
  function sameTime(a,b){if(a&&b&&typeof a.seconds==='number'&&typeof a.nanoseconds==='number'&&typeof b.seconds==='number'&&typeof b.nanoseconds==='number')return Number.isSafeInteger(a.seconds)&&Number.isInteger(a.nanoseconds)&&a.nanoseconds>=0&&a.nanoseconds<1e9&&a.seconds===b.seconds&&a.nanoseconds===b.nanoseconds;return a instanceof Date&&b instanceof Date&&Number.isFinite(a.getTime())&&a.getTime()===b.getTime();}
  function wallet(s){stable(s);const w=s.data();if(typeof s.id!=='string'||!s.id||s.id.includes('/')||!w||w.status!=='open'||!integer(w.amountCents)||w.amountCents===0||!integer(w.unspentCents)||w.unspentCents>w.amountCents||!integer(w.revision)||!sameTime(w.acceptedAt,w.acceptedAt))fail('Invalid accepted wallet');return w;}
  async function inspect(g,s){
   const w=wallet(s),r=await get(g,'sparkDiscoveryRemittances',s.id);if(!r.exists())fail('Accepted wallet has no remittance');const v=r.data();
   if(!v||v.status!=='accepted'||v.amountCents!==w.amountCents||typeof v.presidentUid!=='string'||!v.presidentUid||v.acceptedBy!==v.presidentUid||!sameTime(v.acceptedAt,w.acceptedAt)||!(v.correctionId===null||typeof v.correctionId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v.correctionId)))fail('Accepted wallet and remittance do not match');
   if(v.correctionId!==null){const c=await get(g,'sparkDiscoveryCorrections',v.correctionId);if(!c.exists()||c.data()?.status!=='pending'||c.data()?.remittanceId!==s.id)fail('Invalid pending remittance correction');}
   return {unfrozenCents:v.correctionId===null?w.unspentCents:0,frozenCents:v.correctionId===null?0:w.unspentCents};
  }
  function result(revision,complete){return complete?{revision,complete:true,...totals,acceptedUnspentCents:add(totals.unfrozenCents,totals.frozenCents)}:{revision,complete:false,walletsChecked:totals.walletCount};}
  async function next(){
   if(busy)fail('Accepted funds are already loading');const g=generation;guard(g);busy=true;
   try{
    const before=marker(await get(g,'sparkDiscoveryRevision','current'));if(pinned!==null&&before!==pinned)fail('Faculty Fund changed; restart accepted funds');if(finished)return result(before,true);
    const parts=[api.where('status','==','open'),api.orderBy(api.documentId(),'asc')];if(cursor)parts.push(api.startAfter(cursor));parts.push(api.limit(pageSize+1));
    const page=await api.getDocsFromServer(api.query(api.collection(db,`${root}/sparkDiscoveryWallets`),...parts));guard(g);stable(page);if(!Array.isArray(page.docs)||page.docs.length>pageSize+1)fail('Invalid accepted wallet page');
    for(const s of page.docs)wallet(s);const visible=page.docs.slice(0,pageSize),partial={...totals};for(const s of visible){const x=await inspect(g,s);partial.walletCount=add(partial.walletCount,1);partial.unfrozenCents=add(partial.unfrozenCents,x.unfrozenCents);partial.frozenCents=add(partial.frozenCents,x.frozenCents);}
    const after=marker(await get(g,'sparkDiscoveryRevision','current'));if(before!==after)fail('Faculty Fund changed; restart accepted funds');if(before===0&&page.docs.length)fail('Faculty Fund revision is missing');
    totals=partial;pinned=before;cursor=visible.length?visible[visible.length-1]:cursor;finished=page.docs.length<=pageSize;return result(before,finished);
   }finally{if(g===generation)busy=false;}
  }
  return {next,reset};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkAcceptedFundsPager:createAcceptedFundsPager};else global.createFacultyFundSparkAcceptedFundsPager=createAcceptedFundsPager;
})(typeof window!=='undefined'?window:globalThis);
