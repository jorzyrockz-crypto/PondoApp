'use strict';
const {createHash}=require('node:crypto');
// One canonical form is used for both registration and exact-name search.
function canonicalName(value){
 if(typeof value!=='string') throw new Error('Enter an organization name.');
 const display=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(!display || display.length>120 || /[\p{Cc}\p{Cf}]/u.test(display)) throw new Error('Use a name of 1 to 120 characters without control characters.');
 return {display,key:display.toLowerCase()};
}
function nameId(key){return createHash('sha256').update(key,'utf8').digest('hex')}
function createService({db,FieldValue,HttpsError,now=()=>Date.now()}){
 const err=(code,message)=>{throw new HttpsError(code,message)};
 const uid=r=>{if(!r.auth?.uid)err('unauthenticated','Sign in first.');if(!/^[A-Za-z0-9_-]{1,128}$/.test(r.auth.uid))err('invalid-argument','Unsupported account ID.');return r.auth.uid};
 const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))err('invalid-argument','Invalid organization.');return v};
 const name=v=>{try{return canonicalName(v)}catch(e){err('invalid-argument',e.message)}};
 const orgRef=o=>db.doc(`organizations/${id(o)}`);
 const memberRef=(o,u)=>db.doc(`organizations/${id(o)}/members/${u}`);
 const reqRef=(o,u)=>db.doc(`organizations/${id(o)}/joinRequests/${u}`);
 const mirror=(u,o)=>db.doc(`users/${u}/organizationRequests/${id(o)}`);
 const marker=db.doc('organizationDirectoryConfig/migration');
 async function enabled(tx){const s=await tx.get(marker);if(!s.exists||s.data().ready!==true)err('failed-precondition','Organization discovery is not ready. Ask the administrator to complete the migration.');}
 async function owner(tx,o,u){const m=await tx.get(memberRef(o,u));if(!m.exists||m.data().role!=='owner')err('permission-denied','Only an organization owner can do that.');}
 // Limits casual probing and accidental request storms. This is not a substitute
 // for App Check, production monitoring, and account-abuse controls.
 async function limit(u,action,max){const ref=db.doc(`organizationRateLimits/${u}_${action}`),time=now();await db.runTransaction(async tx=>{const s=await tx.get(ref),d=s.exists?s.data():{};const start=typeof d.start==='number'&&time>=d.start&&time-d.start<60000?d.start:time,count=start===d.start?(d.count||0):0;if(count>=max)err('resource-exhausted','Too many attempts. Try again in a minute.');tx.set(ref,{start,count:count+1});});}
 const timestamp=()=>FieldValue.serverTimestamp();
 const safe=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
 return {
  async create(r){const u=uid(r),n=name(r.data?.name);await limit(u,'create',5);const org=db.collection('organizations').doc(),reservation=db.doc(`organizationNames/${nameId(n.key)}`);await db.runTransaction(async tx=>{await enabled(tx);const found=await tx.get(reservation);if(found.exists)err('already-exists','That organization name is already registered. Choose another name.');tx.create(reservation,{key:n.key,orgId:org.id});tx.create(org,{name:n.display,createdBy:u,createdAt:timestamp(),discoverable:false});tx.create(memberRef(org.id,u),{uid:u,role:'owner',email:safe(r.auth.token?.email)||null,displayName:safe(r.auth.token?.name)||null,photoURL:safe(r.auth.token?.picture,1000)||null,joinedAt:timestamp()});tx.set(mirror(u,org.id),{orgId:org.id,name:n.display,status:'approved',decidedAt:timestamp()});});return {orgId:org.id};},
  async visibility(r){const u=uid(r),o=id(r.data?.orgId);if(typeof r.data?.discoverable!=='boolean')err('invalid-argument','Choose a visibility setting.');await db.runTransaction(async tx=>{await enabled(tx);await owner(tx,o,u);const org=await tx.get(orgRef(o));if(!org.exists)err('not-found','Organization not found.');const n=name(org.data().name),ref=db.doc(`organizationNames/${nameId(n.key)}`),record=await tx.get(ref);if(!record.exists||record.data().orgId!==o||record.data().key!==n.key)err('failed-precondition','Organization name needs administrator review before discovery can be changed.');tx.update(orgRef(o),{discoverable:r.data.discoverable});});return {discoverable:r.data.discoverable};},
  async search(r){const u=uid(r),n=name(r.data?.name);await limit(u,'search',30);return db.runTransaction(async tx=>{await enabled(tx);const reservation=await tx.get(db.doc(`organizationNames/${nameId(n.key)}`));if(!reservation.exists||reservation.data().key!==n.key)return {organization:null};const o=reservation.data().orgId,org=await tx.get(orgRef(o));if(!org.exists||org.data().discoverable!==true)return {organization:null};return {organization:{id:o,name:org.data().name}};});},
  async request(r){const u=uid(r),o=id(r.data?.orgId);await limit(u,'request',10);return db.runTransaction(async tx=>{await enabled(tx);const [org,member,request]=await Promise.all([tx.get(orgRef(o)),tx.get(memberRef(o,u)),tx.get(reqRef(o,u))]);if(!org.exists||org.data().discoverable!==true)err('not-found','Organization is not available for requests.');if(member.exists)err('already-exists','You are already a member.');if(request.exists&&request.data().status==='pending')return {status:'pending'};const details={uid:u,displayName:safe(r.auth.token?.name)||null,email:safe(r.auth.token?.email)||null,status:'pending',requestedAt:timestamp()};tx.set(reqRef(o,u),details);tx.set(mirror(u,o),{orgId:o,name:org.data().name,status:'pending',requestedAt:timestamp()});return {status:'pending'};});},
  async pending(r){const u=uid(r),o=id(r.data?.orgId);return db.runTransaction(async tx=>{await enabled(tx);await owner(tx,o,u);const results=await tx.get(db.collection(`organizations/${o}/joinRequests`).where('status','==','pending').limit(100));return {requests:results.docs.map(s=>({uid:s.id,displayName:s.data().displayName,email:s.data().email}))};});},
  async decide(r){const u=uid(r),o=id(r.data?.orgId),target=id(r.data?.uid),decision=r.data?.decision,role=r.data?.role;if(!['approve','reject'].includes(decision)||decision==='approve'&&!['reviewer','project-manager','disbursing'].includes(role))err('invalid-argument','Choose a valid decision and role.');await db.runTransaction(async tx=>{await enabled(tx);await owner(tx,o,u);const [org,request,member]=await Promise.all([tx.get(orgRef(o)),tx.get(reqRef(o,target)),tx.get(memberRef(o,target))]);if(!org.exists||!request.exists||request.data().status!=='pending')err('failed-precondition','This request is no longer pending. Refresh the list.');if(decision==='approve'&&member.exists)err('already-exists','This user is already a member.');const status=decision==='approve'?'approved':'rejected';if(decision==='approve')tx.create(memberRef(o,target),{uid:target,role,email:request.data().email||null,displayName:request.data().displayName||null,joinedAt:timestamp(),approvedBy:u});tx.update(reqRef(o,target),{status,decidedBy:u,decidedAt:timestamp()});tx.set(mirror(target,o),{orgId:o,name:org.data().name,status,decidedAt:timestamp()});});return {ok:true};},
  async mine(r){const u=uid(r);return db.runTransaction(async tx=>{await enabled(tx);const docs=await tx.get(db.collection(`users/${u}/organizationRequests`).limit(100));const entries=[];for(const s of docs.docs){const d=s.data();if(d.status==='approved'){const m=await tx.get(memberRef(d.orgId,u));entries.push({orgId:d.orgId,name:d.name,status:m.exists?'approved':'not-a-member'});}else entries.push({orgId:d.orgId,name:d.name,status:d.status});}return {requests:entries};});}
 };
}
module.exports={canonicalName,nameId,createService};
