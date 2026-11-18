/* Experimental date-windowed discovery-fixture activity, not a cash report,
 * reconciliation, balance or authorization boundary. Matching protected
 * revision/rules are required; privileged writes can bypass them. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
 const short=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
 const amount=v=>Number.isSafeInteger(v)&&v>0&&v<=100000000;
 const ms=v=>v instanceof Date?v.getTime():typeof v?.toMillis==='function'?v.toMillis():NaN;
 function validDay(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.slice(0,4)==='0000')return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
 function createActivityPager({db,api,orgId,isCurrent,from,to,pageSize=25}){
  const methods=['doc','collection','query','where','orderBy','documentId','limit','startAfter','getDocFromServer','getDocsFromServer'];
  if(!db||!api||methods.some(m=>typeof api[m]!=='function')||typeof orgId!=='string'||!orgId||orgId.includes('/')||typeof isCurrent!=='function'||!validDay(from)||!validDay(to)||from>to||to>'9998-12-31'||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)fail('Invalid activity reader setup or date range');
  // Manila is UTC+08:00. Payment dates are date strings; expense occurrence
  // timestamps use a half-open interval, including the entire selected end day.
  const start=new Date(from+'T00:00:00+08:00'),end=new Date(new Date(to+'T00:00:00+08:00').getTime()+86400000);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start.getTime()<-62135596800000)fail('Activity date range is outside Firestore timestamp limits');
  const root=`organizations/${orgId}`,specs={payments:{collection:'sparkDiscoveryPayments',field:'paymentDate',lower:from,upper:to,upperOp:'<='},expenses:{collection:'sparkDiscoveryExpenseDrafts',field:'occurredAt',lower:start,upper:end,upperOp:'<'}};
  let generation=0,busy=false,pinned=null,state;
  function reset(){generation++;busy=false;pinned=null;state={payments:{cursor:null,finished:false},expenses:{cursor:null,finished:false}};}reset();
  const guard=g=>{if(g!==generation||!isCurrent())fail('Workspace changed; restart activity');};
  const stable=s=>{if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Activity is not server-confirmed');};
  function marker(s){stable(s);if(!s.exists())return 0;const v=s.data().revision;if(!Number.isSafeInteger(v)||v<1)fail('Invalid Faculty Fund revision');return v;}
  async function revision(g){const s=await api.getDocFromServer(api.doc(db,`${root}/sparkDiscoveryRevision/current`));guard(g);return marker(s);}
  function record(s,kind){
   stable(s);const v=s.data();if(!id(s.id)||!v||!id(v.createdBy)||!Number.isFinite(ms(v.createdAt))||!amount(v.amountCents))fail('Invalid activity record');
   if(kind==='payments'){
    if(!id(v.personId)||v.personId.length>80||!short(v.memberName,160)||!validDay(v.absenceDate)||!validDay(v.paymentDate)||v.paymentDate<from||v.paymentDate>to||v.slotId!==v.personId+'~'+v.absenceDate||!(v.remittanceId===null||id(v.remittanceId)))fail('Invalid payment activity');
    const voided=v.voidedAt!==null;if(voided?(!Number.isFinite(ms(v.voidedAt))||!id(v.voidedBy)||!short(v.voidReason,500)||v.remittanceId!==null):(v.voidedBy!==null||v.voidReason!==null))fail('Invalid payment void');
    return {id:s.id,kind:'payment',status:voided?'voided':'active',personId:v.personId,memberName:v.memberName,absenceDate:v.absenceDate,paymentDate:v.paymentDate,amountCents:v.amountCents,remittanceId:v.remittanceId,createdAt:v.createdAt,createdBy:v.createdBy,voidedAt:v.voidedAt,voidedBy:v.voidedBy,voidReason:v.voidReason};
   }
   const occurred=ms(v.occurredAt);if(!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(v.status)||!short(v.description,300)||!short(v.payee,160)||typeof v.reference!=='string'||v.reference.length>160||!Number.isFinite(occurred)||occurred<start.getTime()||occurred>=end.getTime()||!Number.isSafeInteger(v.allocatedCents)||v.allocatedCents<0||v.allocatedCents>v.amountCents||!Number.isSafeInteger(v.count)||v.count<0||v.count>200||v.status==='recorded'&&(v.allocatedCents!==v.amountCents||v.count<1)||['cancelled','voided'].includes(v.status)&&(v.allocatedCents!==0||v.count!==0))fail('Invalid expense activity');
   return {id:s.id,kind:'expense',status:v.status,description:v.description,payee:v.payee,reference:v.reference,amountCents:v.amountCents,allocatedCents:v.allocatedCents,occurredAt:v.occurredAt,createdAt:v.createdAt,createdBy:v.createdBy};
  }
  async function next(kind){
   if(!Object.hasOwn(specs,kind))fail('Invalid activity category');if(busy)fail('Activity is already loading');const g=generation;guard(g);busy=true;
   try{
    const before=await revision(g);if(pinned!==null&&before!==pinned)fail('Faculty Fund changed; restart activity');if(state[kind].finished)return {revision:before,kind,items:[],hasMore:false,complete:Object.values(state).every(x=>x.finished)};
    const s=specs[kind],parts=[api.where(s.field,'>=',s.lower),api.where(s.field,s.upperOp,s.upper),api.orderBy(s.field,'asc'),api.orderBy(api.documentId(),'asc')];if(state[kind].cursor)parts.push(api.startAfter(state[kind].cursor));parts.push(api.limit(pageSize+1));
    const snap=await api.getDocsFromServer(api.query(api.collection(db,`${root}/${s.collection}`),...parts));guard(g);stable(snap);if(!Array.isArray(snap.docs)||snap.docs.length>pageSize+1)fail('Invalid activity page');const records=snap.docs.map(item=>record(item,kind));const after=await revision(g);if(before!==after)fail('Faculty Fund changed; restart activity');if(before===0&&records.length)fail('Faculty Fund revision is missing');
    const hasMore=records.length>pageSize,items=records.slice(0,pageSize);state[kind].cursor=items.length?snap.docs[items.length-1]:state[kind].cursor;state[kind].finished=!hasMore;pinned=before;
    return {revision:before,kind,items,hasMore,complete:Object.values(state).every(x=>x.finished)};
   }finally{if(g===generation)busy=false;}
  }
  return {next,reset};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkActivityPager:createActivityPager};else global.createFacultyFundSparkActivityPager=createActivityPager;
})(typeof window!=='undefined'?window:globalThis);
