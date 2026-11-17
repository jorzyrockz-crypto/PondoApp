/* Experimental bounded history pages. Not a balance, receipt, report, or
 * authorization boundary. Requires the matching revision-enforcing rules.
 * Admin writes bypass those rules. Not loaded by the live app. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function createHistoryPager({db,api,orgId,isCurrent,kind,pageSize=25}){
  const methods=['doc','collection','query','orderBy','documentId','limit','startAfter','getDocFromServer','getDocsFromServer'];
  if(!db||!api||methods.some(x=>typeof api[x]!=='function')||typeof orgId!=='string'||!orgId||orgId.includes('/')||typeof isCurrent!=='function'||!['payments','expenses'].includes(kind)||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)fail('Invalid history pager setup');
  const root=`organizations/${orgId}`,collectionName=kind==='payments'?'sparkPayments':'sparkExpenseDrafts';let revision=null,cursor=null,finished=false,busy=false,generation=0;
  const stable=s=>{if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('History is not server-confirmed');};
  const guard=g=>{if(g!==generation||!isCurrent())fail('Workspace changed; reopen history');};
  const millis=t=>t instanceof Date?t.getTime():typeof t?.toMillis==='function'?t.toMillis():NaN;
  function marker(s){stable(s);if(!s.exists())return 0;const n=s.data().revision;if(!Number.isSafeInteger(n)||n<1)fail('Invalid Faculty Fund revision');return n;}
  function record(s){
   stable(s);const v=s.data();if(typeof s.id!=='string'||!s.id||!v||typeof v.createdBy!=='string'||!v.createdBy||!Number.isFinite(millis(v.createdAt))||!Number.isSafeInteger(v.amountCents)||v.amountCents<=0)fail('Invalid history record');
   if(kind==='payments'){
    if(typeof v.memberName!=='string'||typeof v.absenceDate!=='string'||typeof v.paymentDate!=='string'||!(v.remittanceId===null||typeof v.remittanceId==='string'))fail('Invalid payment history');
   }else if(!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(v.status)||typeof v.description!=='string'||typeof v.payee!=='string'||!Number.isFinite(millis(v.occurredAt))||!Number.isSafeInteger(v.allocatedCents)||v.allocatedCents<0||v.allocatedCents>v.amountCents)fail('Invalid expense history');
   return {...v,id:s.id};
  }
  function reset(){generation++;revision=null;cursor=null;finished=false;busy=false;}
  async function next(){
   if(busy)fail('History is already loading');const g=generation;guard(g);busy=true;
   try{
    const first=await api.getDocFromServer(api.doc(db,`${root}/sparkRevision/current`));guard(g);const start=marker(first);if(revision!==null&&start!==revision)fail('Faculty Fund changed; restart history');
    if(finished)return {revision:start,items:[],hasMore:false};
    const constraints=[api.orderBy('createdAt','desc'),api.orderBy(api.documentId(),'desc')];if(cursor)constraints.push(api.startAfter(cursor));constraints.push(api.limit(pageSize+1));
    const snap=await api.getDocsFromServer(api.query(api.collection(db,`${root}/${collectionName}`),...constraints));guard(g);stable(snap);if(!Array.isArray(snap.docs)||snap.docs.length>pageSize+1)fail('Invalid history page');
    const validated=snap.docs.map(record),end=marker(await api.getDocFromServer(api.doc(db,`${root}/sparkRevision/current`)));guard(g);if(start!==end)fail('Faculty Fund changed; restart history');if(start===0&&snap.docs.length)fail('Faculty Fund revision is missing');
    const hasMore=validated.length>pageSize,items=validated.slice(0,pageSize);revision=start;cursor=items.length?snap.docs[items.length-1]:cursor;finished=!hasMore;return {revision:start,items,hasMore};
   }finally{if(g===generation)busy=false;}
  }
  return {next,reset};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkHistoryPager:createHistoryPager};else global.createFacultyFundSparkHistoryPager=createHistoryPager;
})(typeof window!=='undefined'?window:globalThis);
