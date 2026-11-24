// Workspace-scoped, server-confirmed role changes. Firestore rules are the
// authorization boundary and require the role and history entry to commit together.
export const WORKSPACE_ROLES=Object.freeze(['owner','disbursing','project-manager','reviewer']);
export function createWorkspaceRoleHistory({db,api,getState,getUser,online=()=>true}){
 const {doc,collection,runTransaction,serverTimestamp,getDocsFromServer,query,orderBy,limit}=api;
 const context=()=>{const s=getState(),u=getUser();return {orgId:s?.orgId,uid:u?.uid};};
 const current=(orgId,uid)=>{const s=getState(),u=getUser();return !!(online()&&s?.orgId===orgId&&s.uid===uid&&u?.uid===uid&&s.memberConfirmed&&s.baselineReady&&!s.recoveryLocked&&!s.listenerError&&!s.syncError);};
 const member=(orgId,uid)=>doc(db,'organizations',orgId,'members',uid);
 const history=orgId=>collection(db,'organizations',orgId,'roleHistory');
 async function changeRole({targetUid,expectedRole,newRole}){
  const {orgId,uid}=context(),s=getState();
  if(!orgId||!uid||!current(orgId,uid)||s.role!=='owner'||typeof targetUid!=='string'||!targetUid||targetUid===uid||!WORKSPACE_ROLES.includes(expectedRole)||!WORKSPACE_ROLES.includes(newRole)||expectedRole===newRole)throw Error('The workspace, member or selected role is unavailable.');
  const event=doc(history(orgId));
  try{
   await runTransaction(db,async tx=>{
    if(!current(orgId,uid)||getState().role!=='owner')throw Error('Workspace access changed.');
    const [actor,target]=await Promise.all([tx.get(member(orgId,uid)),tx.get(member(orgId,targetUid))]);
    if(!current(orgId,uid)||getState().role!=='owner')throw Error('Workspace access changed.');
    if(!actor.exists()||actor.data().role!=='owner'||!target.exists()||target.data().role!==expectedRole)throw Error('The role or access changed. Refresh the member list.');
    tx.update(member(orgId,targetUid),{role:newRole,_roleChangeId:event.id});
    tx.set(event,{actorUid:uid,memberUid:targetUid,oldRole:expectedRole,newRole,createdAt:serverTimestamp()});
   });
  }catch(error){
   // A network error is not proof of failure. Do not automatically retry.
   if(['unavailable','deadline-exceeded','unknown','cancelled','aborted'].includes(error?.code)){const e=Error('The change could not be confirmed. Check the member and workspace history online before retrying.');e.name='RoleChangeUnconfirmed';e.eventId=event.id;e.orgId=orgId;throw e;}
   throw error;
  }
  return {orgId,eventId:event.id};
 }
 async function readRecent(){
  const {orgId,uid}=context();if(!orgId||!uid||!current(orgId,uid))throw Error('Connect and confirm workspace access to view history.');
  const result=await getDocsFromServer(query(history(orgId),orderBy('createdAt','desc'),limit(101)));
  if(!current(orgId,uid))throw Error('Workspace access changed.');
  return {orgId,uid,items:result.docs.slice(0,100).map(d=>({id:d.id,...d.data()})),more:result.docs.length>100};
 }
 return {changeRole,readRecent};
}
