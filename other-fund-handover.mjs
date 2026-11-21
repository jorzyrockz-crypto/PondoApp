// Handover decisions live in server-confirmed documents, not the shared ledger snapshot.
// A single deterministic document per payment prevents concurrent duplicate handovers.
const maxHistory=20;
export function stableHandoverJSON(value){const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.keys(v).sort().reduce((o,k)=>(o[k]=sort(v[k]),o),{}):v;return JSON.stringify(sort(value));}
export function handoverMatchesPayment(handover,payment){return !!handover&&!!payment&&stableHandoverJSON(handover.payment)===stableHandoverJSON(payment);}
function priorAttempt(r){return {payment:r.payment,senderUid:r.senderUid,receiverUid:r.receiverUid,initiatorUid:r.initiatorUid,handoverDate:r.handoverDate,notes:r.notes,status:r.status,createdAt:r.createdAt,decidedBy:r.decidedBy,decidedAt:r.decidedAt};}
function validDate(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;}
export function createOtherFundHandoverService({db,api,getState,getUser}){
 const {doc,collection,query,limit,onSnapshot,runTransaction,serverTimestamp}=api;
 const ref=(org,id)=>doc(db,'organizations',org,'otherFundHandovers',id),snapshot=org=>doc(db,'organizations',org,'data','snapshot'),member=(org,uid)=>doc(db,'organizations',org,'members',uid);
 const idOK=id=>typeof id==='string'&&id.length>0&&id.length<=150&&!id.includes('/');
 const current=(org,uid)=>{const s=getState();return !!(s&&s.orgId===org&&s.uid===uid&&getUser()?.uid===uid&&s.role&&s.memberConfirmed&&s.baselineReady&&!s.recoveryLocked&&!s.listenerError&&s.online!==false&&globalThis.navigator?.onLine!==false);};
 const writable=(org,uid)=>{const s=getState();return current(org,uid)&&!s.syncError&&!s.dirty&&!s.pushTimer&&!s.pushesInFlight;};
 const requireReady=(org,uid)=>{if(!writable(org,uid))throw Error('Reconnect and wait for team sync before continuing.');};
 const serverPayment=(server,payment)=>server.exists()&&Array.isArray(server.data().otherPayments)&&server.data().otherPayments.some(p=>p.id===payment.id&&handoverMatchesPayment({payment:p},payment));
 function watch(org,uid,notify){const q=query(collection(db,'organizations',org,'otherFundHandovers'),limit(501));return onSnapshot(q,{includeMetadataChanges:true},snap=>{if(!current(org,uid)||snap.metadata.fromCache||snap.metadata.hasPendingWrites){notify({status:'unconfirmed',items:[]});return;}notify({status:'ready',items:snap.docs.slice(0,500).map(d=>({id:d.id,...d.data()})),more:snap.docs.length>500});},()=>{if(current(org,uid))notify({status:'error',items:[]});});}
 async function submit(org,uid,payment,{senderUid,receiverUid,handoverDate,notes}){
  requireReady(org,uid);if(payment?.sampleData===true)throw Error('Sample payments cannot create account-confirmed handovers.');if(!idOK(payment?.id)||!idOK(senderUid)||!idOK(receiverUid)||senderUid===receiverUid||![senderUid,receiverUid].includes(uid)||!validDate(handoverDate)||typeof notes!=='string'||notes.length>300)throw Error('Choose two different workspace members, including yourself, and a valid date.');
  const target=ref(org,payment.id);return runTransaction(db,async tx=>{const old=await tx.get(target),server=await tx.get(snapshot(org)),sender=await tx.get(member(org,senderUid)),receiver=await tx.get(member(org,receiverUid));requireReady(org,uid);
   if(!sender.exists()||!receiver.exists())throw Error('Both people must still be workspace members.');if(!serverPayment(server,payment))throw Error('The payment changed or has not synced. Review it again.');
   const existing=old.exists()?old.data():null;
   if(existing?.status==='pending'&&existing.initiatorUid===uid&&existing.senderUid===senderUid&&existing.receiverUid===receiverUid&&existing.handoverDate===handoverDate&&existing.notes===notes&&handoverMatchesPayment(existing,payment))return 'pending';
   if(existing&&existing.status!=='declined')throw Error('A handover already exists for this payment. Refresh its status.');
   const history=existing?[...(existing.history||[]),priorAttempt(existing)]:[];if(history.length>maxHistory)throw Error('This payment has too many declined requests; seek help.');
   tx.set(target,{payment,senderUid,receiverUid,initiatorUid:uid,handoverDate,notes,status:'pending',createdAt:serverTimestamp(),history});return 'pending';
  });
 }
 async function decide(org,uid,id,decision){
  requireReady(org,uid);if(!idOK(id)||!['confirmed','declined'].includes(decision))throw Error('Invalid handover decision.');
  return runTransaction(db,async tx=>{const target=ref(org,id),entry=await tx.get(target),server=await tx.get(snapshot(org));requireReady(org,uid);if(!entry.exists())throw Error('Handover not found.');const r=entry.data();
   if(![r.senderUid,r.receiverUid].includes(uid)||r.initiatorUid===uid)throw Error('Only the other participant can decide this request.');
   if(r.status===decision&&r.decidedBy===uid)return decision;
   if(r.status!=='pending')throw Error('This handover was already decided. Refresh its status.');
   if(decision==='confirmed'&&!serverPayment(server,r.payment))throw Error('The payment changed. Decline this request and create a new one.');
   const other=await tx.get(member(org,r.initiatorUid));requireReady(org,uid);if(decision==='confirmed'&&!other.exists())throw Error('The other participant is no longer a workspace member.');
   tx.update(target,{status:decision,decidedBy:uid,decidedAt:serverTimestamp()});return decision;
  });
 }
 return {watch,submit,decide};
}
