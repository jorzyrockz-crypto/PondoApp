// Reconcile only workspaces already referenced by this account's request/creation
// records. Membership and organization must both still exist on the server;
// the account-owned list is an index, not a grant of access.
export async function recoverWorkspaceMemberships({db,api,uid,isCurrent,knownIds=[]}) {
 const {doc,collection,query,orderBy,documentId,startAfter,limit,getDocFromServer,getDocsFromServer,runTransaction,arrayUnion}=api;
 if(!uid||!isCurrent())return {ids:[],partial:false};
 const known=new Set(knownIds),ids=[],failed=[];let cursor=null,partial=false;
 // The initial profile may have come from cache. Compare against a fresh server
 // read so a stale local list cannot suppress a repair needed on other devices.
 const serverProfile=await getDocFromServer(doc(db,'users',uid));
 if(!isCurrent())return {ids,partial:true};
 const serverKnown=new Set(serverProfile.exists()&&Array.isArray(serverProfile.data().orgMemberships)?serverProfile.data().orgMemberships:[]);
 for(let page=0;page<10;page++){
  if(!isCurrent())return {ids,partial:true};
  const constraints=[orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(100)];
  const result=await getDocsFromServer(query(collection(db,'users',uid,'organizationRequests'),...constraints));
  if(!isCurrent())return {ids,partial:true};
  for(const entry of result.docs){
   if(!isCurrent())return {ids,partial:true};
   const orgId=entry.id,data=entry.data();
   if(typeof orgId!=='string'||!orgId||orgId.length>150||data?.orgId!==orgId||(known.has(orgId)&&serverKnown.has(orgId)))continue;
   try{
    const confirmed=await runTransaction(db,async tx=>{
     const profile=doc(db,'users',uid),member=doc(db,'organizations',orgId,'members',uid),org=doc(db,'organizations',orgId);
     const m=await tx.get(member);
     if(!isCurrent()||!m.exists()||m.data()?.uid!==uid)return false;
     const [o,p]=await Promise.all([tx.get(org),tx.get(profile)]);
     if(!isCurrent()||!o.exists())return false;
     const list=p.exists()&&Array.isArray(p.data().orgMemberships)?p.data().orgMemberships:[];
     // Legacy single-workspace profiles must first be migrated by the regular
     // login path. Never replace a legacy membership list from this repair.
     if(p.exists()&&!Array.isArray(p.data().orgMemberships))throw Error('Profile migration is not confirmed.');
     if(!list.includes(orgId))tx.set(profile,{orgMemberships:arrayUnion(orgId)},{merge:true});
     return true;
    });
    if(!isCurrent())return {ids,partial:true};
    if(confirmed){known.add(orgId);serverKnown.add(orgId);ids.push(orgId);}
   }catch(e){failed.push(orgId);}
  }
  if(result.docs.length<100)break;
  cursor=result.docs[result.docs.length-1];if(page===9)partial=true;
 }
 return {ids,partial:partial||failed.length>0};
}
