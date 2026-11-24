// Only these local assets may be selected or rendered from workspace data.
export const CLAY_AVATAR_IDS=Object.freeze(['classic','sunny','blossom','sky']);
export function createClayAvatarService({db,api,getUser,getState,online=()=>true}){
 const {doc,getDocFromServer,runTransaction}=api;
 const valid=id=>CLAY_AVATAR_IDS.includes(id);
 const current=(uid,orgId)=>{const u=getUser(),s=getState();return u?.uid===uid&&!u.photoURL&&(s?.orgId||null)===orgId&&(!orgId||(s.uid===uid&&s.memberConfirmed));};
 const userRef=uid=>doc(db,'users',uid);
 const memberRef=(org,uid)=>doc(db,'organizations',org,'members',uid);
 async function load(){const u=getUser(),uid=u?.uid;if(!uid||u.photoURL||!online())return null;const snap=await getDocFromServer(userRef(uid));if(getUser()?.uid!==uid||getUser()?.photoURL)return null;const id=snap.exists()?snap.data().clayAvatar:null;return valid(id)?id:'classic';}
 async function save(id){const u=getUser(),s=getState(),uid=u?.uid,orgId=s?.orgId||null;if(!valid(id)||!uid||!online()||!current(uid,orgId))throw Error('Connect and confirm your workspace to change your avatar.');
  await runTransaction(db,async tx=>{if(!current(uid,orgId))throw Error('Account or workspace changed.');if(orgId){const member=await tx.get(memberRef(orgId,uid));if(!member.exists())throw Error('Workspace membership could not be confirmed.');}if(!current(uid,orgId))throw Error('Account or workspace changed.');tx.set(userRef(uid),{clayAvatar:id},{merge:true});if(orgId)tx.update(memberRef(orgId,uid),{clayAvatar:id});});
  return {uid,orgId,id};
 }
 // Refresh each workspace when opened, reading the authoritative profile inside
 // the transaction so a stale device cannot overwrite a newer selection.
 async function syncWorkspace(){const u=getUser(),s=getState(),uid=u?.uid,orgId=s?.orgId||null;if(!uid||!orgId||!online()||!current(uid,orgId))return false;
  await runTransaction(db,async tx=>{if(!current(uid,orgId))throw Error('Account or workspace changed.');const [profile,member]=await Promise.all([tx.get(userRef(uid)),tx.get(memberRef(orgId,uid))]);if(!current(uid,orgId)||!member.exists())throw Error('Workspace membership changed.');const id=profile.exists()?profile.data().clayAvatar:null;if(valid(id)&&member.data().clayAvatar!==id)tx.update(memberRef(orgId,uid),{clayAvatar:id});});
  return true;
 }
 return {load,save,syncWorkspace};
}
