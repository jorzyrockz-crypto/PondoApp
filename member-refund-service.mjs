// Reviewer requests are separate immutable submissions, not writes to the shared ledger.
// All writes require server transactions; callers must keep an uncertain submission ID for retry.
export function createMemberRefundService({db,api,getState,getSnapshot,stableJSON,stripSnapshot,clientId}) {
 const {doc,collection,query,where,orderBy,limit,onSnapshot,runTransaction,serverTimestamp,getDocFromServer,getDocsFromServer,startAfter}=api;
 const requestRef=(org,id)=>doc(db,'organizations',org,'memberRefundRequests',id);
 const current=(org,uid)=>{const s=getState();return !!s&&s.orgId===org&&s.uid===uid&&s.memberConfirmed&&s.baselineReady&&!s.recoveryLocked&&!s.listenerError&&s.online!==false&&globalThis.navigator?.onLine!==false;};
 const approver=(org,uid)=>{const s=getState();return current(org,uid)&&['owner','disbursing'].includes(s.role)&&!s.dirty&&!s.syncError&&!s.pushTimer&&!s.pushesInFlight;};
 const fields=['uid','description','reimburseTo','amountCents','expenseDate','supplier','category','reference'];
 const same=(a,b)=>fields.every(k=>a[k]===b[k]);
 const valid=r=>{if(!r||typeof r.uid!=='string'||!r.uid||typeof r.description!=='string'||!r.description.trim()||r.description.length>300||typeof r.reimburseTo!=='string'||!r.reimburseTo.trim()||r.reimburseTo.length>160||!Number.isSafeInteger(r.amountCents)||r.amountCents<=0||r.amountCents>1000000000||typeof r.expenseDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.expenseDate))return false;const date=new Date(r.expenseDate+'T00:00:00Z');if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==r.expenseDate)return false;return ['supplier','category','reference'].every(k=>typeof r[k]==='string'&&r[k].length<=160);};
 function watch(org,uid,notify){
  const q=query(collection(db,'organizations',org,'memberRefundRequests'),orderBy('createdAt','desc'),limit(101));
  return onSnapshot(q,{includeMetadataChanges:true},snap=>{
   if(!current(org,uid)){notify({status:'unconfirmed',items:[]});return;}
   if(snap.metadata.fromCache||snap.metadata.hasPendingWrites){notify({status:'unconfirmed',items:[]});return;}
   const docs=snap.docs,items=docs.slice(0,100).map(d=>({id:d.id,...d.data()}));notify({status:'ready',items,more:docs.length>100,cursor:docs[99]||null});
  },()=>{if(current(org,uid))notify({status:'error',items:[]});});
 }
 // Pending-only query ensures old pending items are not hidden behind the
 // latest 100 decided requests. Cap results and disclose overflow to the UI.
 function watchPending(org,uid,notify){
  const q=query(collection(db,'organizations',org,'memberRefundRequests'),where('status','==','pending'),limit(101));
  return onSnapshot(q,{includeMetadataChanges:true},snap=>{
   if(!current(org,uid)||snap.metadata.fromCache||snap.metadata.hasPendingWrites){notify({status:'unconfirmed',items:[]});return;}
   const docs=snap.docs;notify({status:'ready',items:docs.slice(0,100).map(d=>({id:d.id,...d.data()})),more:docs.length>100});
  },()=>{if(current(org,uid))notify({status:'error',items:[]});});
 }
 async function older(org,uid,cursor){
  if(!current(org,uid)||!cursor)throw Error('Workspace or connection changed.');
  const q=query(collection(db,'organizations',org,'memberRefundRequests'),orderBy('createdAt','desc'),startAfter(cursor),limit(101)),snap=await getDocsFromServer(q);
  if(!current(org,uid))throw Error('Workspace or connection changed.');const docs=snap.docs;
  return {items:docs.slice(0,100).map(d=>({id:d.id,...d.data()})),more:docs.length>100,cursor:docs[99]||null};
 }
 async function submit(org,uid,id,payload){
  if(!current(org,uid)||getState().role!=='reviewer'||payload.uid!==uid||!valid(payload))throw Error('Workspace, membership or connection changed.');
  const ref=requestRef(org,id);
  return runTransaction(db,async tx=>{
   const old=await tx.get(ref);
   if(!current(org,uid)||getState().role!=='reviewer')throw Error('Workspace, membership or connection changed.');
   if(old.exists()){if(!same(old.data(),payload)||!['pending','approved','rejected'].includes(old.data().status))throw Error('The submission ID is already used for a different or invalid request.');return old.data().status;}
   tx.set(ref,{...payload,status:'pending',createdAt:serverTimestamp()});return 'pending';
  });
 }
 async function check(org,uid,id,payload){
  if(!current(org,uid)||getState().role!=='reviewer'||payload.uid!==uid)throw Error('Workspace, membership or connection changed.');
  const result=await getDocFromServer(requestRef(org,id));
  if(!current(org,uid)||getState().role!=='reviewer')throw Error('Workspace, membership or connection changed.');
  if(!result.exists())return 'absent';if(!same(result.data(),payload)||!['pending','approved','rejected'].includes(result.data().status))throw Error('Submission ID belongs to a different or invalid request.');return result.data().status;
 }
 async function decide(org,uid,id,decision,reason,actorName){
  if(!['approved','rejected'].includes(decision)||!approver(org,uid))throw Error('Confirm your access and wait for team sync before reviewing.');
  const s=getState(),baseline=s.lastSyncedJSON,revision=s.lastSyncedRevision;
  if(!Number.isSafeInteger(revision)||revision<0||baseline===null||stableJSON(stripSnapshot(getSnapshot()))!==baseline)throw Error('The local team snapshot is not confirmed.');
  const request=requestRef(org,id),snapshot=doc(db,'organizations',org,'data','snapshot');
  return runTransaction(db,async tx=>{
   const req=await tx.get(request),server=await tx.get(snapshot);
   if(!approver(org,uid)||getState().lastSyncedJSON!==baseline||getState().lastSyncedRevision!==revision||stableJSON(stripSnapshot(getSnapshot()))!==baseline)throw Error('Team data or access changed; review again.');
   if(!req.exists())throw Error('Request no longer exists.');const r=req.data();
   if(!valid(r))throw Error('The request contains invalid details.');
   if(r.status!=='pending')throw Error('This request was already decided. Refresh its status.');
   if(!server.exists())throw Error('The team snapshot is not ready.');
   const {_syncRevision=0,updatedAt,updatedBy,writerClientId,...data}=server.data();
   if(_syncRevision!==revision||stableJSON(data)!==baseline)throw Error('The team snapshot changed; refresh before reviewing.');
   if(decision==='approved'){
    if(!Array.isArray(data.payables)||!Array.isArray(data.auditLog)||data.payables.some(x=>x.id===id)||data.auditLog.some(x=>x.id==='member-refund-approval-'+id))throw Error('The request or team snapshot conflicts with an existing record.');
    const member=getState().members?.find(m=>m.uid===r.uid);const requestedBy={uid:r.uid,name:member?.displayName||member?.email||r.uid},actor={uid,name:actorName||'Approver'},timestamp=new Date().toISOString();
    const bill={id,projectId:null,kind:'advance',description:r.description,supplier:r.supplier,reimburseTo:r.reimburseTo,receiptNo:r.reference,amount:r.amountCents/100,invoiceDate:r.expenseDate,dueDate:'',category:r.category||'Project expense',createdBy:requestedBy};
    const entry={id:'member-refund-approval-'+id,action:'approve refund request',timestamp,reason:'Approved member submission',projectName:'',record:{id,description:r.description,amount:r.amountCents/100,reimburseTo:r.reimburseTo,requestedBy},by:actor};
    tx.set(snapshot,{...data,payables:[...data.payables,bill],auditLog:[...data.auditLog,entry],_syncRevision:revision+1,updatedAt:serverTimestamp(),updatedBy:uid,writerClientId:clientId+'-member-refund'});
   }
   tx.update(request,{status:decision,decidedBy:uid,decidedAt:serverTimestamp(),decisionReason:reason});
   return decision;
  });
 }
 return {watch,watchPending,older,submit,check,decide};
}
