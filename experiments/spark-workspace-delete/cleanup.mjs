// EXPERIMENT ONLY. Not connected to the application or production rules.
// This can clear known direct and recovery entries but cannot discover unknown nested
// collections or finalize a permanent deletion. Do not use on real data.
const DIRECT=['data','presence','joinRequests','memberRefundRequests','refundReceipts','editorRefundReceipts','sparkDiscoveryRevision','sparkDiscoveryConfig','sparkDiscoveryPresidentHistory','sparkDiscoveryPeople','sparkDiscoveryPaymentSlots','sparkDiscoveryPayments','sparkDiscoveryRemittances','sparkDiscoveryCorrections','sparkDiscoveryLines','sparkDiscoveryMemberReceipts','sparkDiscoveryRemittanceReceipts','sparkDiscoveryWallets','sparkDiscoveryExpenseDrafts','sparkDiscoveryAllocations','members'];
const RECOVERY_KINDS=['sparkDiscoveryPeople','sparkDiscoveryPayments','sparkDiscoveryPaymentSlots','sparkDiscoveryRemittances','sparkDiscoveryLines','sparkDiscoveryWallets','sparkDiscoveryExpenseDrafts','sparkDiscoveryAllocations','sparkDiscoveryCorrections','sparkDiscoveryPresidentHistory','sparkDiscoveryMemberReceipts','sparkDiscoveryRemittanceReceipts','sparkDiscoveryConfig'];
const validSegment=x=>typeof x==='string'&&x.length>0&&x.length<=150&&!x.includes('/')&&x!=='.'&&x!=='..';
export function createExperimentalSparkCleanup({db,api,getContext}){
 const {doc,collection,query,where,limit,orderBy,documentId,startAfter,runTransaction,writeBatch,getDocFromServer,getDocsFromServer,serverTimestamp,arrayRemove}=api;
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
 // Enumerate only extant recovery headers/sessions. Missing document parents
 // can have descendants that browser queries cannot discover: inventory remains
 // required and headers are intentionally retained.
 const recoveryGroups={backup:'sparkVerifiedBackups',session:'sparkRestoreProofSessions'};
 function recoveryGroup(type){if(!Object.hasOwn(recoveryGroups,type))throw Error('Unknown recovery record type.');return recoveryGroups[type];}
 async function listRecoveryParents(orgId,uid,{type,cursor=null}={}){
  const group=recoveryGroup(type);if(cursor!==null&&!validSegment(cursor))throw Error('Invalid recovery cursor.');
  await checkOwner(orgId,uid);const parts=[orderBy(documentId())];if(cursor!==null)parts.push(startAfter(cursor));parts.push(limit(20));
  const page=confirmed(await getDocsFromServer(query(collection(db,'organizations',orgId,group),...parts)));scope(orgId,uid);
  const ids=page.docs.map(d=>d.id);if(ids.some(id=>!validSegment(id)))throw Error('Unsupported recovery ID; administrative inventory required.');
  return {ids,nextCursor:ids.length===20?ids.at(-1):null,completeInventory:false};
 }
 async function clearRecoveryEntries(orgId,uid,{type,parentId}={}){
  const group=recoveryGroup(type);if(!validSegment(parentId))throw Error('Invalid recovery parent ID.');await checkOwner(orgId,uid);
  const parent=confirmed(await getDocFromServer(doc(db,'organizations',orgId,group,parentId)));scope(orgId,uid);
  if(!parent.exists())throw Error('Recovery parent is missing; administrative inventory required.');
  for(const kind of RECOVERY_KINDS){
   const segments=type==='backup'?['sparkVerifiedBackups',parentId,'collections',kind,'entries']:['sparkRestoreProof','current','sessions',parentId,'collections',kind,'entries'];
   const page=confirmed(await getDocsFromServer(query(collection(db,'organizations',orgId,...segments),limit(20))));scope(orgId,uid);
   if(page.docs.length){const batch=writeBatch(db);for(const entry of page.docs)batch.delete(entry.ref);scope(orgId,uid);await batch.commit();scope(orgId,uid);return {state:'in-progress',type,kind,removed:page.docs.length};}
  }
  return {state:'awaiting-verification',type,finalized:false};
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
    if(entry.id===uid){
     // Self-profile rules allow ordinary writes; use a transaction so another
     // device changing the owner's selection cannot be overwritten by a stale read.
     await runTransaction(db,async tx=>{
      const own=await tx.get(profile);scope(orgId,uid);const p=own.exists()?own.data():{};
      tx.set(profile,{orgMemberships:arrayRemove(orgId),_workspaceCleanupOrg:orgId,...(p.activeOrganizationId===orgId?{activeOrganizationId:null}:{}),...(p.organizationId===orgId?{organizationId:null}:{})},{merge:true});
      tx.delete(doc(db,'users',uid,'organizationRequests',orgId));tx.delete(entry.ref);scope(orgId,uid);
     });scope(orgId,uid);return {state:'in-progress',group,removed:entries.length};
    }
    attempts=[{active:false,legacy:false},{active:true,legacy:false},{active:false,legacy:true},{active:true,legacy:true}];
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
 return {freeze,clearNext,listRecoveryParents,clearRecoveryEntries};
}
