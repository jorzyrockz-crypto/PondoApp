// Explicit two-way review of an unconfirmed team draft, against a server base.
// No inferred deletions: every draft-only record is an explicit add/skip choice.
import './offline-sync.js';
const planner=globalThis.PondoOfflineSync;
const roles=new Set(['owner','disbursing','project-manager']);
export function reviewTeamDraftPlan(target,draft,choices={}){
 const initial=planner.plan(target,draft,{}), additions=initial.changes.filter(x=>x.kind==='add');
 const missing=additions.filter(x=>!['add','skip'].includes(choices[planner.key(x.field,x.id)]));
 const filtered={...draft};for(const field of planner.fields)filtered[field]=draft[field].filter(x=>{const k=planner.key(field,x.id);return target[field].some(t=>t.id===x.id)||choices[k]==='add';});
 const plan=planner.plan(target,filtered,choices);
 return {...plan,additions,unresolved:plan.unresolved+missing.length,skipped:additions.filter(x=>choices[planner.key(x.field,x.id)]==='skip').length};
}
// Approval/deletion workflows and shared receipt documents require their own
// server-side coordination; do not resurrect or replace them in this path.
function blocked(value){if(!value||typeof value!=='object')return false;if(Array.isArray(value))return value.some(blocked);return !!(value.pendingApproval||value.pendingDeletion||value.sharedReceiptDigest||value.receiptDigest)||Object.values(value).some(blocked);}
export function checkedTeamDraftPlan(target,draft,choices,validate){
 const p=reviewTeamDraftPlan(target,draft,choices);
 if(p.unresolved)throw Error('Choose an action for every addition and conflict.');
 if(p.changes.some(c=>blocked(c.offline)||(c.kind==='replace'&&blocked(c.destination))))throw Error('Selected records have pending approvals, deletions or shared receipts. Keep the team version or skip them and reconcile those workflows separately.');
 if(p.changes.some(c=>c.field==='payables'&&c.offline.kind==='advance'&&c.offline.receiptImage))throw Error('Refunds with local receipt images cannot yet be reconciled as shared receipts. Skip the addition or keep the team version.');
 validate(p.merged);return p;
}
export function createTeamDraftReconciler({db,api,getState,getUser,getDraft,validate,stripSnapshot,stableJSON,sharedData,sharedRevision,clientId}){
 const {doc,getDocFromServer,runTransaction,serverTimestamp}=api;
 const check=(org,uid,raw,role)=>{
  const s=getState();if(!s||s.orgId!==org||s.uid!==uid||getUser()?.uid!==uid||!s.recoveryLocked||s.pushTimer||s.pushesInFlight||s.pendingSnapshot||s.listenerError||s.online===false||globalThis.navigator?.onLine===false||!roles.has(s.role)||(role&&s.role!==role))throw Error('Workspace, connection or access changed. Review again.');
  if(raw!==undefined&&getDraft(uid,org)!==raw)throw Error('The saved draft changed. Review again.');
 };
 const memberRef=(org,uid)=>doc(db,'organizations',org,'members',uid),snapshotRef=org=>doc(db,'organizations',org,'data','snapshot');
 const memberRole=(snap,role)=>{if(!snap.exists()||!roles.has(snap.data()?.role)||(role&&snap.data().role!==role))throw Error('Your edit access could not be confirmed.');return snap.data().role;};
 async function review(org,uid){
  check(org,uid);const raw=getDraft(uid,org);if(raw===null)throw Error('The saved draft could not be read.');const draft=JSON.parse(raw);
  const [member,server]=await Promise.all([getDocFromServer(memberRef(org,uid)),getDocFromServer(snapshotRef(org))]);
  const role=memberRole(member);check(org,uid,raw,role);if(!server.exists())throw Error('The team snapshot does not exist. Do not discard the draft.');
  const data=server.data(),target=sharedData(data),revision=sharedRevision(data),baseline=stableJSON(target);planner.plan(target,draft,{});
  return {org,uid,raw,draft,target,revision,baseline,role};
 }
 async function commit(review,choices){
  const {org,uid,raw,role,baseline,revision}=review;check(org,uid,raw,role);
  const plan=checkedTeamDraftPlan(review.target,review.draft,choices,validate),stripped=stripSnapshot(plan.merged),nextJSON=stableJSON(stripped);
  await runTransaction(db,async tx=>{
   const member=await tx.get(memberRef(org,uid)),server=await tx.get(snapshotRef(org));memberRole(member,role);check(org,uid,raw,role);
   if(!server.exists()||sharedRevision(server.data())!==revision||stableJSON(sharedData(server.data()))!==baseline)throw Error('The team copy changed. Review again.');
   // Validate the exact choices against the transaction baseline on every retry.
   const rechecked=checkedTeamDraftPlan(sharedData(server.data()),JSON.parse(raw),choices,validate);
   if(stableJSON(stripSnapshot(rechecked.merged))!==nextJSON)throw Error('The reviewed changes no longer match.');
   check(org,uid,raw,role);
   if(nextJSON!==baseline)tx.set(snapshotRef(org),{...stripped,_syncRevision:revision+1,updatedAt:serverTimestamp(),updatedBy:uid,writerClientId:clientId});
  });
  return {snapshot:plan.merged,revision:nextJSON===baseline?revision:revision+1,baseline:nextJSON,changes:plan.changes};
 }
 return {review,commit};
}
