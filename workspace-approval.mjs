// Account-private approval reconciliation. No owner writes another user's profile.
// Only server-confirmed membership + approved request can add a workspace.
export function createWorkspaceApprovalTracker({db,api,isCurrent,onChange,onMembership,onMissing=()=>{},onError=()=>{}}) {
 const {doc,collection,query,limit,onSnapshot,runTransaction,arrayUnion,serverTimestamp}=api;
 let uid=null,generation=0,unsub=null,rows=new Map(),members=new Map(),busy=new Set();
 const current=(user,g)=>uid===user&&generation===g&&isCurrent(user);
 const validId=id=>typeof id==='string'&&id.length>0&&id.length<=150&&!id.includes('/');
 const timeKey=t=>Number.isInteger(t?.seconds)&&Number.isInteger(t?.nanoseconds)?t.seconds+':'+t.nanoseconds:null;
 const keyOf=value=>{const t=timeKey(value?.joinedAt);return t&&typeof value.approvedBy==='string'?t+':'+value.approvedBy:null;};
 function publish(){
  if(!uid||!isCurrent(uid))return;
  const items=[];
  for(const [orgId,row] of rows){const member=members.get(orgId)?.value,key=member&&keyOf(member);
   if(!key||row.approvalKey!==key||typeof row.approvalNoticeRead!=='boolean'||typeof row.approvalNewSeen!=='boolean')continue;
   items.push({orgId,name:typeof row.name==='string'?row.name:'Workspace',key,read:row.approvalNoticeRead,newSeen:row.approvalNewSeen,ts:member.joinedAt.toMillis()});
  }
  onChange(items);
 }
 async function reconcile(orgId,user,g){
  if(!current(user,g)||busy.has(g+':'+orgId)||!members.get(orgId)?.value)return;
  busy.add(g+':'+orgId);
  try{
   const result=await runTransaction(db,async tx=>{
    const profile=doc(db,'users',user),mine=doc(db,'users',user,'organizationRequests',orgId),member=doc(db,'organizations',orgId,'members',user),request=doc(db,'organizations',orgId,'joinRequests',user);
    const [p,mineSnap,memberSnap,requestSnap]=await Promise.all([tx.get(profile),tx.get(mine),tx.get(member),tx.get(request)]);
    if(!current(user,g)||!mineSnap.exists()||!memberSnap.exists()||!requestSnap.exists())return null;
    const r=mineSnap.data(),m=memberSnap.data(),decision=requestSnap.data(),key=keyOf(m),decided=timeKey(decision.decidedAt);
    if(r.created===true||r.orgId!==orgId||!key||decision.status!=='approved'||decision.decidedBy!==m.approvedBy||!decided||decided!==timeKey(m.joinedAt))return null;
    const data=p.exists()?p.data():{},ids=Array.isArray(data.orgMemberships)?data.orgMemberships:(data.organizationId?[data.organizationId]:[]);
    const listed=ids.includes(orgId),prior=typeof r.approvalKey==='string'?r.approvalKey:null;
    // Do not label already-listed historical memberships as newly joined.
    if(!listed)tx.set(profile,{orgMemberships:arrayUnion(orgId)},{merge:true});
    if((!listed||prior)&&prior!==key)tx.update(mine,{approvalKey:key,approvalNoticeRead:false,approvalNewSeen:false,approvalAddedAt:serverTimestamp()});
    return {orgId,listed};
   });
   if(result&&current(user,g))onMembership(orgId);
  }catch(e){if(current(user,g))onError(e);}
  finally{busy.delete(g+':'+orgId);}
 }
 function stop(){generation++;if(unsub)unsub();unsub=null;for(const entry of members.values())entry?.unsubscribe?.();members.clear();rows.clear();busy.clear();uid=null;onChange([]);}
 function start(user){
  stop();if(!user||!isCurrent(user))return;uid=user;const g=++generation;
  unsub=onSnapshot(query(collection(db,'users',user,'organizationRequests'),limit(100)),{includeMetadataChanges:true},snap=>{
   if(!current(user,g)||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
   const next=new Map();snap.forEach(item=>{const v=item.data();if(validId(item.id)&&v.orgId===item.id&&v.created!==true)next.set(item.id,v);});
   rows=next;
   for(const [id,entry] of members)if(!rows.has(id)){entry.unsubscribe();members.delete(id);}
   for(const id of rows.keys())if(!members.has(id)){
    const entry={unsubscribe:()=>{},value:null};members.set(id,entry);
    entry.unsubscribe=onSnapshot(doc(db,'organizations',id,'members',user),{includeMetadataChanges:true},memberSnap=>{
     if(!current(user,g)||members.get(id)!==entry||memberSnap.metadata.fromCache||memberSnap.metadata.hasPendingWrites)return;
     entry.value=memberSnap.exists()?memberSnap.data():null;publish();if(entry.value)void reconcile(id,user,g);else onMissing(id);
    },err=>{if(current(user,g)&&members.get(id)===entry){entry.value=null;publish();onError(err);}});
   }
   publish();
  },err=>{if(current(user,g)){onError(err);}});
 }
 // Update flags only for the same membership generation, preventing an old
 // tab from dismissing a subsequent approval for the same workspace.
 async function mark(orgId,key,field){
  const user=uid,g=generation;if(!current(user,g)||!validId(orgId)||!['approvalNoticeRead','approvalNewSeen'].includes(field))return;
  try{await runTransaction(db,async tx=>{const ref=doc(db,'users',user,'organizationRequests',orgId),s=await tx.get(ref);if(current(user,g)&&s.exists()&&s.data().approvalKey===key&&s.data()[field]===false)tx.update(ref,{[field]:true});});}
  catch(e){if(current(user,g))onError(e);}
 }
 return {start,stop,markRead:(id,key)=>mark(id,key,'approvalNoticeRead'),markSeen:(id,key)=>mark(id,key,'approvalNewSeen')};
}
