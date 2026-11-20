// EXPERIMENT ONLY. Not connected to the application or production rules.
// This can clear known direct collections but cannot discover unknown nested
// collections or finalize a permanent deletion. Do not use on real data.
const DIRECT=['data','presence','joinRequests','memberRefundRequests','refundReceipts','editorRefundReceipts','sparkDiscoveryRevision','sparkDiscoveryConfig','sparkDiscoveryPresidentHistory','sparkDiscoveryPeople','sparkDiscoveryPaymentSlots','sparkDiscoveryPayments','sparkDiscoveryRemittances','sparkDiscoveryCorrections','sparkDiscoveryLines','sparkDiscoveryMemberReceipts','sparkDiscoveryRemittanceReceipts','sparkDiscoveryWallets','sparkDiscoveryExpenseDrafts','sparkDiscoveryAllocations','members'];
const validSegment=x=>typeof x==='string'&&x.length>0&&x.length<=150&&!x.includes('/')&&x!=='.'&&x!=='..';
export function createExperimentalSparkCleanup({db,api,getContext}){
 const {doc,collection,query,where,limit,runTransaction,writeBatch,getDocFromServer,getDocsFromServer,serverTimestamp,arrayRemove}=api;
 function scope(orgId,uid){
  const c=getContext();if(!validSegment(orgId)||!validSegment(uid)||!c||c.orgId!==orgId||c.uid!==uid||c.currentUid!==uid||c.online!==true)throw Error('Workspace, account or connection changed.');
 }
 function confirmed(snap){if(snap?.metadata?.fromCache||snap?.metadata?.hasPendingWrites)throw Error('A server-confirmed result is required.');return snap;}
 const root=org=>doc(db,'organizations',org),member=(org,uid)=>doc(db,'organizations',org,'members',uid);
 async function freeze(orgId,uid){
  scope(orgId,uid);
  return runTransaction(db,async tx=>{
   const [o,m]=await Promise.all([tx.get(root(orgId)),tx.get(member(orgId,uid))]);scope(orgId,uid);
   if(!o.exists()||!m.exists()||m.data().role!=='owner')throw Error('A current workspace owner is required.');
   if(o.data().deletionState==='deleting'){
    if(o.data().deletingBy!==uid)throw Error('Another owner started this cleanup.');
    return 'already-frozen';
   }
   if(o.data().deletionState&&o.data().deletionState!=='active')throw Error('Invalid workspace state.');
   tx.update(root(orgId),{deletionState:'deleting',deletingBy:uid,deletingAt:serverTimestamp(),discoverable:false});return 'frozen';
  });
 }
 async function checkOwner(orgId,uid){
  scope(orgId,uid);const [o,m]=await Promise.all([getDocFromServer(root(orgId)),getDocFromServer(member(orgId,uid))]);scope(orgId,uid);confirmed(o);confirmed(m);
  if(!o.exists()||o.data().deletionState!=='deleting'||o.data().deletingBy!==uid||!m.exists()||m.data().role!=='owner')throw Error('Cleanup ownership or workspace state changed.');
 }
 // One bounded, retryable batch. A caller may repeat until the return value is
 // awaiting-verification, which is deliberately NOT a deletion confirmation.
 async function clearNext(orgId,uid){
  await checkOwner(orgId,uid);
  for(const group of [...DIRECT,'invites']){
   scope(orgId,uid);
   const accountGroup=group==='members'||group==='joinRequests',pageSize=accountGroup?2:20;
   const source=group==='invites'?query(collection(db,'invites'),where('orgId','==',orgId),limit(pageSize)):query(collection(db,'organizations',orgId,group),limit(pageSize));
   const found=confirmed(await getDocsFromServer(source));scope(orgId,uid);
   const candidates=found.docs.filter(d=>group!=='members'||d.id!==uid),entries=accountGroup?candidates.slice(0,1):candidates;
   if(!entries.length)continue;
   if(accountGroup){
    const entry=entries[0],profile=doc(db,'users',entry.id);let attempts;
    if(entry.id===uid){const own=confirmed(await getDocFromServer(profile));scope(orgId,uid);const p=own.exists()?own.data():{};attempts=[{active:p.activeOrganizationId===orgId,legacy:p.organizationId===orgId}];}
    else attempts=[{active:false,legacy:false},{active:true,legacy:false},{active:false,legacy:true},{active:true,legacy:true}];
    let done=false;
    for(const {active,legacy} of attempts){
     const batch=writeBatch(db),patch={orgMemberships:arrayRemove(orgId),_workspaceCleanupOrg:orgId,...(active?{activeOrganizationId:null}:{}),...(legacy?{organizationId:null}:{})};
     batch.set(profile,patch,{merge:true});batch.delete(doc(db,'users',entry.id,'organizationRequests',orgId));batch.delete(entry.ref);scope(orgId,uid);
     try{await batch.commit();scope(orgId,uid);done=true;break;}
     catch(e){if(e?.code!=='permission-denied')throw e;await checkOwner(orgId,uid);}
    }
    if(!done)throw Error('Could not safely reconcile this member account. Cleanup remains incomplete.');
   }else{const batch=writeBatch(db);for(const entry of entries)batch.delete(entry.ref);scope(orgId,uid);await batch.commit();scope(orgId,uid);}
   return {state:'in-progress',group,removed:entries.length};
  }
  return {state:'awaiting-verification',finalized:false};
 }
 return {freeze,clearNext};
}
