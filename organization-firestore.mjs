// Firebase Auth + Firestore only. All permissions and atomic invariants are
// enforced in firestore.rules; these client checks are just user feedback.
export function organizationName(value) {
  if (typeof value !== 'string') throw new Error('Enter an organization name.');
  const name=value.trim().replace(/\s+/gu,' ');
  if (!name || name.length>120 || /[\/\p{Cc}\p{Cf}]/u.test(name) || name==='.' || name==='..' || /^__.*__$/.test(name))
    throw new Error('Use 1 to 120 characters without slashes or control characters.');
  // Firestore Rules lower() folds ASCII A-Z only, so mirror that exactly.
  return {name,id:name.replace(/[A-Z]/g,c=>c.toLowerCase())};
}
export function createOrganizationDirectory({db,api,getUser}) {
  const {doc,collection,getDoc,getDocs,setDoc,updateDoc,writeBatch,runTransaction,serverTimestamp,query,where,limit}=api;
  const user=()=>{const u=getUser();if(!u)throw new Error('Sign in first.');return u};
  const org=o=>doc(db,'organizations',o), member=(o,u)=>doc(db,'organizations',o,'members',u), request=(o,u)=>doc(db,'organizations',o,'joinRequests',u), mine=(u,o)=>doc(db,'users',u,'organizationRequests',o);
  const identity=u=>({uid:u.uid,email:typeof u.email==='string'?u.email.slice(0,320):null,displayName:typeof u.displayName==='string'?u.displayName.slice(0,160):null});
  return {
    async orgCreate({name:raw}) {
      const u=user(),{name,id}=organizationName(raw),b=writeBatch(db);
      b.set(org(id),{name,createdBy:u.uid,createdAt:serverTimestamp(),discoverable:false});
      b.set(member(id,u.uid),{...identity(u),role:'owner',photoURL:u.photoURL||null,joinedAt:serverTimestamp()});
      b.set(mine(u.uid,id),{orgId:id,name,created:true});
      try{await b.commit()}catch(e){if(e.code==='permission-denied')throw new Error('Could not create this organization. Its name may already be registered, or your access may have changed.');throw e}
      return {orgId:id};
    },
    async orgSetVisibility({orgId,discoverable}) {user();await updateDoc(org(orgId),{discoverable});return {discoverable}},
    async orgSearch({name}) {
      user();const {id}=organizationName(name);let s;
      try{s=await getDoc(org(id))}catch(e){if(e.code==='permission-denied')return {organization:null};throw e}
      return {organization:s.exists() && s.data().discoverable===true?{id,name:s.data().name}:null};
    },
    async orgRequestJoin({orgId}) {
      const u=user();await runTransaction(db,async tx=>{
        const o=await tx.get(org(orgId)),m=await tx.get(member(orgId,u.uid)),r=await tx.get(request(orgId,u.uid));
        if(!o.exists()||o.data().discoverable!==true)throw new Error('Organization is not available for requests.');
        if(m.exists())throw new Error('You are already a member.');
        if(r.exists()&&r.data().status==='pending')return;
        tx.set(request(orgId,u.uid),{...identity(u),status:'pending',requestedAt:serverTimestamp()});
        tx.set(mine(u.uid,orgId),{orgId,name:o.data().name,created:false});
      });return {status:'pending'};
    },
    async orgPendingRequests({orgId}) {
      user();const s=await getDocs(query(collection(db,'organizations',orgId,'joinRequests'),where('status','==','pending'),limit(100)));
      return {requests:s.docs.map(d=>({uid:d.id,displayName:d.data().displayName,email:d.data().email}))};
    },
    async orgDecideRequest({orgId,uid,decision,role}) {
      const u=user();if(!['approve','reject'].includes(decision)||decision==='approve'&&!['reviewer','project-manager','disbursing'].includes(role))throw new Error('Choose a valid decision and role.');
      await runTransaction(db,async tx=>{
        const r=await tx.get(request(orgId,uid)),m=await tx.get(member(orgId,uid));
        if(!r.exists()||r.data().status!=='pending')throw new Error('This request is no longer pending. Refresh the list.');
        if(decision==='approve'&&m.exists())throw new Error('This user is already a member.');
        if(decision==='approve')tx.set(member(orgId,uid),{uid,role,email:r.data().email,displayName:r.data().displayName,joinedAt:serverTimestamp(),approvedBy:u.uid});
        tx.update(request(orgId,uid),{status:decision==='approve'?'approved':'rejected',decidedBy:u.uid,decidedAt:serverTimestamp()});
      });return {ok:true};
    },
    async orgMyRequests() {
      const u=user(),s=await getDocs(query(collection(db,'users',u.uid,'organizationRequests'),limit(100))),entries=[];
      for(const d of s.docs){const row=d.data();try{const m=await getDoc(member(row.orgId,u.uid));if(m.exists()){entries.push({orgId:row.orgId,name:row.name,status:'approved'});continue}if(row.created){entries.push({orgId:row.orgId,name:row.name,status:'not-a-member'});continue}const r=await getDoc(request(row.orgId,u.uid));entries.push({orgId:row.orgId,name:row.name,status:r.exists()?(r.data().status==='approved'?'not-a-member':r.data().status):'not-a-member'});}catch(e){entries.push({orgId:row.orgId,name:row.name,status:'unavailable'});}}
      return {requests:entries};
    }
  };
}
