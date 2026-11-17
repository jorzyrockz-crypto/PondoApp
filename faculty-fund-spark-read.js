/* Experimental Spark reader; not loaded by the app or enabled in production.
 * Consistency depends on the matching versioned rules: every financial client
 * write must atomically advance the same revision. Admin writes bypass rules. */
(function(global){
 'use strict';
 const fail=message=>{throw Error(message)};
 function createSparkReader({db,api,orgId,isCurrent,project,maxDocuments=1000}){
  if(!db||!api||typeof orgId!=='string'||!orgId||orgId.includes('/')||typeof isCurrent!=='function'||typeof project!=='function'||!Number.isSafeInteger(maxDocuments)||maxDocuments<1||maxDocuments>5000)fail('Invalid Faculty Fund reader setup');
  const {doc,collection,query,limit,getDocFromServer,getDocsFromServer}=api;
  if(!doc||!collection||!query||!limit||!getDocFromServer||!getDocsFromServer)fail('Server-only Firestore reads are unavailable');
  const root=`organizations/${orgId}`,ref=(name,id)=>doc(db,`${root}/${name}/${id}`);
  const stable=s=>{if(!s.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Faculty Fund data is not server-confirmed');};
  const current=()=>{if(!isCurrent())fail('Workspace changed while Faculty Fund was loading');};
  const marker=s=>{stable(s);if(!s.exists())return 0;const n=s.data().revision;if(!Number.isSafeInteger(n)||n<1)fail('Faculty Fund revision is invalid');return n;};
  async function read(){
   current();const first=await getDocFromServer(ref('sparkRevision','current')),revision=marker(first);current();
   const configSnapshot=await getDocFromServer(ref('sparkConfig','current'));stable(configSnapshot);current();
   const paths={people:'sparkPeople',payments:'sparkPayments',slots:'sparkPaymentSlots',remittances:'sparkRemittances',lines:'sparkLines',wallets:'sparkWallets',expenses:'sparkExpenseDrafts',allocations:'sparkAllocations',corrections:'sparkCorrections',presidentHistory:'sparkPresidentHistory',memberReceipts:'sparkMemberReceipts',remittanceReceipts:'sparkRemittanceReceipts'};
   const records={};
   for(const [name,path] of Object.entries(paths)){
    const snapshot=await getDocsFromServer(query(collection(db,`${root}/${path}`),limit(maxDocuments+1)));stable(snapshot);current();
    if(snapshot.size>maxDocuments)fail('Faculty Fund exceeds the safe loading limit; archival is required');
    records[name]=snapshot.docs.map(item=>{stable(item);return {...item.data(),id:item.id};});
   }
   const last=await getDocFromServer(ref('sparkRevision','current')),end=marker(last);current();
   if(end!==revision)fail('Faculty Fund changed while loading; refresh and try again');
   if(revision===0&&(configSnapshot.exists()||Object.values(records).some(items=>items.length)))fail('Faculty Fund revision is missing; recovery is required');
   const config=configSnapshot.exists()?configSnapshot.data():null;
   if(config){
    const assignment=records.presidentHistory.find(x=>x.id===config.assignmentId),millis=t=>typeof t?.toMillis==='function'?t.toMillis():NaN;
    if(!assignment||assignment.presidentUid!==config.presidentUid||assignment.assignedBy!==config.assignedBy||!Number.isFinite(millis(config.assignedAt))||millis(config.assignedAt)!==millis(assignment.assignedAt))fail('President assignment history is inconsistent; recovery is required');
   }else if(records.presidentHistory.length)fail('President assignment is missing; recovery is required');
   const projection=project({confirmed:true,...records});current();
   return {revision,config,projection,records};
  }
  return {read};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkReader};else global.createFacultyFundSparkReader=createSparkReader;
})(typeof window!=='undefined'?window:globalThis);
