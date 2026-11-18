'use strict';
// This suite clears only the fixed demo project's loopback emulator.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const api=require('firebase/firestore');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp}=api;
const PROJECT='demo-pondo-security';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Refusing to run: start the local Firestore emulator first.');
let env,createDirectory,organizationName;
test.before(async()=>{({createOrganizationDirectory:createDirectory,organizationName}=await import('../organization-firestore.mjs'));env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}})});
test.beforeEach(async()=>env.clearFirestore());test.after(async()=>{if(env)await env.cleanup()});
const client=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const ref=(c,p)=>doc(c,p);
const directory=uid=>{const db=client(uid),u={uid,email:uid+'@example.test',displayName:uid,photoURL:null};return {db,service:createDirectory({db,api,getUser:()=>u})}};
async function seed(rows){await env.withSecurityRulesDisabled(async context=>{const store=context.firestore();for(const [p,value] of Object.entries(rows))await setDoc(ref(store,p),value)})}

test('concurrent case and whitespace variants have one winner, with private-by-default profile',async()=>{
 const a=directory('alice'),b=directory('bob'),guest=directory('guest');
 const outcomes=await Promise.allSettled([a.service.orgCreate({name:' School  Fund '}),b.service.orgCreate({name:'school fund'})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 const winner=outcomes[0].status==='fulfilled'?a:b,orgId='org~school fund';
 assert.equal((await winner.service.orgMyRequests()).requests[0].status,'approved');
 assert.equal((await guest.service.orgSearch({name:'SCHOOL FUND'})).organization,null);
 await assertFails(getDoc(ref(guest.db,`organizations/${orgId}`)));await assertFails(getDocs(collection(guest.db,'organizations')));
 await assertFails(updateDoc(ref(guest.db,`organizations/${orgId}`),{discoverable:true}));
 await assertFails(updateDoc(ref(winner.db,`organizations/${orgId}`),{name:'Other'}));
 await winner.service.orgSetVisibility({orgId,discoverable:true});const found=(await guest.service.orgSearch({name:'SCHOOL FUND'})).organization;assert.equal(found.id,orgId);assert.equal(found.name.toLowerCase(),'school fund');
 await winner.service.orgSetVisibility({orgId,discoverable:false});assert.equal((await guest.service.orgSearch({name:'school fund'})).organization,null);
});

test('Unicode names are supported, while unauthorized creation and forged canonical IDs fail',async()=>{
 const owner=directory('owner'),attacker=directory('attacker');const id=organizationName('Paaralang Ñandú').id;
 assert.equal((await owner.service.orgCreate({name:'Paaralang Ñandú'})).orgId,id);
 await assert.rejects(attacker.service.orgCreate({name:'PAARALANG Ñandú'}));
 const b=writeBatch(attacker.db);b.set(ref(attacker.db,'organizations/org~other'),{name:'Paaralang Ñandú',createdBy:'attacker',createdAt:serverTimestamp(),discoverable:false});b.set(ref(attacker.db,'organizations/org~other/members/attacker'),{uid:'attacker',role:'owner'});await assertFails(b.commit());
 await assertFails(setDoc(ref(attacker.db,'organizations/improper'),{name:'improper',createdBy:'attacker',createdAt:serverTimestamp(),discoverable:false}));
 await assertFails(setDoc(ref(attacker.db,`organizations/${id}/members/attacker`),{uid:'attacker',role:'owner'}));
});

test('join requests require a public org and owner approval, and removal revokes access',async()=>{
 const owner=directory('owner'),guest=directory('guest'),attacker=directory('attacker');const {orgId}=await owner.service.orgCreate({name:'Team'}),p=`organizations/${orgId}`;
 await assert.rejects(guest.service.orgRequestJoin({orgId}));
 await owner.service.orgSetVisibility({orgId,discoverable:true});await guest.service.orgRequestJoin({orgId});await guest.service.orgRequestJoin({orgId});
 assert.equal((await owner.service.orgPendingRequests({orgId})).requests.length,1);assert.equal((await guest.service.orgMyRequests()).requests[0].status,'pending');
 await assertFails(getDocs(collection(guest.db,`${p}/joinRequests`)));await assertFails(getDoc(ref(guest.db,`${p}/data/snapshot`)));
 await assert.rejects(attacker.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'}));
 await assertFails(updateDoc(ref(guest.db,`${p}/joinRequests/guest`),{status:'approved',decidedBy:'guest',decidedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref(owner.db,`${p}/joinRequests/guest`),{status:'approved',decidedBy:'owner',decidedAt:serverTimestamp()}));
 await assert.rejects(owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'owner'}));
 await owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'});
 assert.equal((await guest.service.orgMyRequests()).requests[0].status,'approved');await assertSucceeds(getDoc(ref(guest.db,`${p}/members/guest`)));
 await assertFails(updateDoc(ref(guest.db,`${p}/members/guest`),{role:'owner'}));
 await assertSucceeds(setDoc(ref(owner.db,`${p}/data/snapshot`),{_syncRevision:1,updatedBy:'owner'}));await assertSucceeds(getDoc(ref(guest.db,`${p}/data/snapshot`)));await assertFails(updateDoc(ref(guest.db,`${p}/data/snapshot`),{_syncRevision:2,updatedBy:'guest'}));
 await assertSucceeds(deleteDoc(ref(owner.db,`${p}/members/guest`)));assert.equal((await guest.service.orgMyRequests()).requests[0].status,'not-a-member');await assertFails(getDoc(ref(guest.db,`${p}/data/snapshot`)));
});

test('rejection does not create membership; repeated decisions cannot grant access',async()=>{
 const owner=directory('owner'),guest=directory('guest');const {orgId}=await owner.service.orgCreate({name:'Group'});await owner.service.orgSetVisibility({orgId,discoverable:true});await guest.service.orgRequestJoin({orgId});
 await owner.service.orgDecideRequest({orgId,uid:'guest',decision:'reject'});assert.equal((await guest.service.orgMyRequests()).requests[0].status,'rejected');
 await assert.rejects(owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'}));await assertFails(getDoc(ref(guest.db,`organizations/${orgId}/data/snapshot`)));
 await guest.service.orgRequestJoin({orgId});assert.equal((await guest.service.orgMyRequests()).requests[0].status,'pending');
});

test('reviewer and removed members cannot write; invite use is atomic',async()=>{
 await seed({'organizations/school':{name:'School',discoverable:false},'organizations/school/members/owner':{uid:'owner',role:'owner'},'organizations/school/members/reviewer':{uid:'reviewer',role:'reviewer'},'organizations/school/data/snapshot':{_syncRevision:1,updatedBy:'owner'},'invites/code1':{orgId:'school',createdBy:'owner',role:'reviewer',usedCount:0,maxUses:1,revoked:false,expiresAt:null}});
 const owner=client('owner'),reviewer=client('reviewer'),guest=client('guest'),other=client('other'),p='organizations/school/data/snapshot';
 await assertSucceeds(getDoc(ref(reviewer,p)));await assertFails(updateDoc(ref(reviewer,p),{_syncRevision:2,updatedBy:'reviewer'}));
 await assertFails(setDoc(ref(guest,'organizations/school/members/guest'),{uid:'guest',role:'reviewer',inviteCode:'code1'}));
 let b=writeBatch(guest);b.update(ref(guest,'invites/code1'),{usedCount:1});b.set(ref(guest,'organizations/school/members/guest'),{uid:'guest',role:'reviewer',inviteCode:'code1'});await assertSucceeds(b.commit());
 b=writeBatch(other);b.update(ref(other,'invites/code1'),{usedCount:2});b.set(ref(other,'organizations/school/members/other'),{uid:'other',role:'reviewer',inviteCode:'code1'});await assertFails(b.commit());
 await assertSucceeds(deleteDoc(ref(owner,'organizations/school/members/reviewer')));await assertFails(getDoc(ref(reviewer,p)));
});

test('competing owner decisions cannot create membership after rejection',async()=>{
 const owner=directory('owner'),guest=directory('guest');const {orgId}=await owner.service.orgCreate({name:'Paaralan'});await owner.service.orgSetVisibility({orgId,discoverable:true});await guest.service.orgRequestJoin({orgId});
 const results=await Promise.allSettled([owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'}),owner.service.orgDecideRequest({orgId,uid:'guest',decision:'reject'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const request=await getDoc(ref(guest.db,`organizations/${orgId}/joinRequests/guest`)),member=await getDoc(ref(guest.db,`organizations/${orgId}/members/guest`));
 assert.equal(member.exists(),request.data().status==='approved');
 if(member.exists())assert.equal(member.data().role,'reviewer');
});

test('forged requests and unrelated user profiles cannot grant access',async()=>{
 const owner=directory('owner'),guest=directory('guest'),attacker=directory('attacker'),anonymous=client(null);const {orgId}=await owner.service.orgCreate({name:'Team'});await owner.service.orgSetVisibility({orgId,discoverable:true});const root=`organizations/${orgId}`;
 assert.equal((await guest.service.orgSearch({name:'unknown'})).organization,null);
 await assertFails(getDoc(ref(anonymous,root)));await assertFails(setDoc(ref(attacker.db,`${root}/joinRequests/guest`),{uid:'guest',email:null,displayName:null,status:'pending',requestedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(attacker.db,'users/guest/organizationRequests/team'),{orgId,name:'Team',created:false}));
 await guest.service.orgRequestJoin({orgId});
 await assertFails(setDoc(ref(attacker.db,`${root}/members/guest`),{uid:'guest',role:'reviewer',approvedBy:'attacker'}));
 await assertFails(updateDoc(ref(attacker.db,`${root}/joinRequests/guest`),{status:'approved',decidedBy:'attacker',decidedAt:serverTimestamp()}));
 await assertFails(deleteDoc(ref(owner.db,root)));
});

test('presence is member-only and each user can write only their own server timestamp',async()=>{
 await seed({'organizations/school':{name:'School'},'organizations/school/members/owner':{uid:'owner',role:'owner'},'organizations/school/members/reviewer':{uid:'reviewer',role:'reviewer'}});
 const owner=client('owner'),reviewer=client('reviewer'),stranger=client('stranger');
 const path='organizations/school/presence/';
 await assertSucceeds(setDoc(ref(reviewer,path+'reviewer'),{lastSeen:serverTimestamp()}));
 await assertSucceeds(getDocs(collection(owner,'organizations/school/presence')));
 await assertFails(getDocs(collection(stranger,'organizations/school/presence')));
 await assertFails(setDoc(ref(reviewer,path+'owner'),{lastSeen:serverTimestamp()}));
 await assertFails(setDoc(ref(reviewer,path+'reviewer'),{lastSeen:new Date('2099-01-01')}));
 await assertFails(setDoc(ref(reviewer,path+'reviewer'),{lastSeen:serverTimestamp(),extra:'private'}));
 await assertSucceeds(deleteDoc(ref(owner,'organizations/school/members/reviewer')));
 await assertFails(setDoc(ref(reviewer,path+'reviewer'),{lastSeen:serverTimestamp()}));
 await assertFails(getDocs(collection(reviewer,'organizations/school/presence')));
});

test('Faculty Fund state and acceptance cannot be forged by any client',async()=>{
 await seed({'organizations/school':{name:'School'},'organizations/school/members/owner':{uid:'owner',role:'owner'},'organizations/school/members/ao':{uid:'ao',role:'disbursing'},'organizations/school/members/president':{uid:'president',role:'reviewer'},'organizations/school/facultyFund/config':{presidentUid:'president'},'organizations/school/facultyFund/control':{revision:1},'organizations/school/facultyFund/state':{payments:[],remittances:[{id:'r',status:'pending'}],audit:[]},'organizations/school/facultyFundOperations/op':{uid:'ao',hash:'private'},'organizations/school/facultyFundBackups/backup':{workspaceId:'school',revision:1}});
 const root='organizations/school',owner=client('owner'),ao=client('ao'),president=client('president'),outsider=client('outsider');
 for(const db of [owner,ao,president]){
  await assertSucceeds(getDoc(ref(db,`${root}/facultyFund/config`)));
  await assertSucceeds(getDoc(ref(db,`${root}/facultyFund/state`)));
  await assertFails(updateDoc(ref(db,`${root}/facultyFund/state`),{remittances:[{id:'r',status:'accepted',acceptedByUid:'president'}]}));
  await assertFails(setDoc(ref(db,`${root}/facultyFund/config`),{presidentUid:'ao'}));
  await assertFails(deleteDoc(ref(db,`${root}/facultyFund/state`)));
  await assertFails(getDoc(ref(db,`${root}/facultyFund/control`)));
  await assertFails(setDoc(ref(db,`${root}/facultyFund/control`),{revision:999}));
  await assertFails(getDoc(ref(db,`${root}/facultyFundOperations/op`)));
  await assertFails(getDoc(ref(db,`${root}/facultyFundBackups/backup`)));
  await assertFails(setDoc(ref(db,`${root}/facultyFundBackups/forged`),{revision:1}));
  await assertFails(setDoc(ref(db,`${root}/facultyFundOperations/forged`),{uid:'ao'}));
 }
 await assertFails(getDoc(ref(outsider,`${root}/facultyFund/state`)));
 await assertFails(getDoc(ref(owner,`${root}/facultyFund/other`)));
 await assertFails(getDocs(collection(owner,`${root}/facultyFund`)));
 await assertSucceeds(deleteDoc(ref(owner,`${root}/members/president`)));
 await assertFails(getDoc(ref(president,`${root}/facultyFund/state`)));
});

test('Faculty Fund server transactions enforce membership, idempotency and concurrent cash safeguards',async()=>{
 const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
 const {createFacultyFundService}=require('../faculty-fund-functions/faculty-fund-service.cjs');
 const admin=initializeApp({projectId:PROJECT},'faculty-fund-emulator-'+Date.now()),db=getFirestore(admin),root='organizations/school';
 try{
  await seed({[root]:{name:'School'},[`${root}/members/owner`]:{uid:'owner',role:'owner'},[`${root}/members/ao`]:{uid:'ao',role:'disbursing'},[`${root}/members/president`]:{uid:'president',role:'reviewer'},[`${root}/members/reviewer`]:{uid:'reviewer',role:'reviewer'}});
  let count=0;const run=createFacultyFundService({db,clock:()=>new Date('2026-11-09T11:00:00.000Z')});
  const invoke=(uid,operation,fields={},requestId=String(++count).padStart(32,'0'))=>run({auth:{uid},input:{orgId:'school',operation,requestId,...fields}});
  await assert.rejects(invoke('reviewer','assignPresident',{presidentUid:'president',role:'owner'}));await invoke('owner','assignPresident',{presidentUid:'president'});
  const person=await invoke('ao','registerPerson',{name:'Teacher'}),paymentData={personId:person.personId,absenceDate:'2026-11-08',paymentDate:'2026-11-09'},token='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const payment=await invoke('ao','recordPayment',paymentData,token),replay=await invoke('ao','recordPayment',paymentData,token);assert.equal(payment.paymentId,replay.paymentId);assert.equal(replay.replayed,true);
  const submissions=await Promise.allSettled([invoke('ao','submitRemittance',{paymentIds:[payment.paymentId]}),invoke('ao','submitRemittance',{paymentIds:[payment.paymentId]})]);assert.equal(submissions.filter(x=>x.status==='fulfilled').length,1);const remittance=submissions.find(x=>x.status==='fulfilled').value;
  await assert.rejects(invoke('ao','accept',{remittanceId:remittance.remittanceId,uid:'president'}));await invoke('president','accept',{remittanceId:remittance.remittanceId});
  const expense={occurredAt:'2026-11-09T11:00:00.000Z',amountCents:20000,description:'School activity',payee:'Supplier'};const expenses=await Promise.allSettled([invoke('ao','recordExpense',expense),invoke('ao','recordExpense',expense)]);assert.equal(expenses.filter(x=>x.status==='fulfilled').length,1);
  const saved=(await db.doc(`${root}/facultyFund/state`).get()).data();assert.equal(saved.payments.length,1);assert.equal(saved.expenses.length,1);assert.equal(saved.remittances[0].acceptedByUid,'president');assert.equal(saved.remittances[0].acceptedAt,'2026-11-09T11:00:00.000Z');
  await assertFails(updateDoc(ref(client('president'),`${root}/facultyFund/state`),{remittances:[]}));
  await db.doc(`${root}/members/president`).delete();await assert.rejects(invoke('president','approveRemittanceVoid',{remittanceId:remittance.remittanceId}));
 }finally{await deleteApp(admin)}
});
test('shared appearance is owner-only and cannot alter the registered name or arbitrary fields',async()=>{
 const owner=directory('owner'),viewer=directory('viewer'),outsider=directory('outsider');
 const {orgId}=await owner.service.orgCreate({name:'Appearance Example'});
 await seed({[`organizations/${orgId}/members/viewer`]:{uid:'viewer',role:'reviewer'}});
 const org=ref(owner.db,`organizations/${orgId}`);
 await assertSucceeds(updateDoc(org,{teamColor:'ocean',teamIcon:'star'}));
 assert.equal((await getDoc(ref(viewer.db,`organizations/${orgId}`))).data().teamColor,'ocean');
 await assertFails(updateDoc(ref(viewer.db,`organizations/${orgId}`),{teamColor:'rose',teamIcon:'heart'}));
 await assertFails(updateDoc(ref(outsider.db,`organizations/${orgId}`),{teamColor:'rose',teamIcon:'heart'}));
 await assertFails(updateDoc(org,{teamColor:'url(evil)',teamIcon:'star'}));
 await assertFails(updateDoc(org,{teamColor:'rose',teamIcon:'<script>'}));
 await assertFails(updateDoc(org,{teamColor:'rose',teamIcon:'heart',name:'Different'}));
 await assertFails(deleteDoc(org));
});
test('removal notice is atomic, private, and remains readable after access is revoked',async()=>{
 const owner=directory('owner'),other=directory('other'),member=directory('member'),orgId=(await owner.service.orgCreate({name:'Notice School'})).orgId;
 await seed({[`organizations/${orgId}/members/member`]:{uid:'member',role:'reviewer'},[`organizations/${orgId}/members/other`]:{uid:'other',role:'reviewer'}});
 const noticePath='users/member/teamNotices/notice1',memberPath=`organizations/${orgId}/members/member`;
 const payload={kind:'removed',orgId,orgName:'Notice School',actorUid:'owner',createdAt:serverTimestamp(),read:false};
 await assertFails(setDoc(ref(owner.db,noticePath),payload));
 let forged=writeBatch(other.db);forged.set(ref(other.db,noticePath),{...payload,actorUid:'other'});forged.delete(ref(other.db,memberPath));await assertFails(forged.commit());
 let bad=writeBatch(owner.db);bad.set(ref(owner.db,noticePath),{...payload,orgName:'False name'});bad.delete(ref(owner.db,memberPath));await assertFails(bad.commit());
 assert.ok((await getDoc(ref(member.db,memberPath))).exists());
 let batch=writeBatch(owner.db);batch.set(ref(owner.db,noticePath),payload);batch.delete(ref(owner.db,memberPath));await assertSucceeds(batch.commit());
 await assertFails(getDoc(ref(member.db,`organizations/${orgId}`)));assert.equal((await getDoc(ref(member.db,noticePath))).data().kind,'removed');
 assert.equal((await getDocs(collection(member.db,'users/member/teamNotices'))).size,1);
 await assertFails(getDoc(ref(owner.db,noticePath)));await assertFails(getDoc(ref(other.db,noticePath)));
 await assertFails(updateDoc(ref(member.db,noticePath),{orgName:'Forged'}));
 await assertSucceeds(updateDoc(ref(member.db,noticePath),{read:true}));await assertFails(updateDoc(ref(member.db,noticePath),{read:false}));
 await assertFails(deleteDoc(ref(member.db,noticePath)));await assertFails(setDoc(ref(owner.db,'users/member/teamNotices/notice2'),payload));
});
test('public prefix suggestions are bounded and never expose private workspaces',async()=>{
 const owner=directory('owner'),other=directory('other'),guest=directory('guest'),anon=client(null);
 const a=(await owner.service.orgCreate({name:'Alpha Teachers'})).orgId,b=(await other.service.orgCreate({name:'Alpha Secret'})).orgId;
 await owner.service.orgSetVisibility({orgId:a,discoverable:true});
 const found=await guest.service.orgSuggest({prefix:'ALP'});assert.deepEqual(found.organizations.map(o=>o.id),[a]);assert.ok(!found.organizations.some(o=>o.id===b));
 assert.deepEqual((await guest.service.orgSuggest({prefix:'x'})).organizations,[]);
 await assertFails(getDocs(collection(guest.db,'organizations')));
 await assertFails(getDocs(api.query(collection(guest.db,'organizations'),api.limit(10))));
 await assertFails(getDocs(api.query(collection(guest.db,'organizations'),api.where('discoverable','==',true),api.limit(11))));
 await assertFails(getDocs(api.query(collection(anon,'organizations'),api.where('discoverable','==',true),api.limit(10))));
});
test('owner receives pending requester identity in live snapshots and decisions update the list',async()=>{
 const owner=directory('owner'),guest=directory('guest'),outsider=directory('outsider'),orgId=(await owner.service.orgCreate({name:'Live Requests'})).orgId;
 await owner.service.orgSetVisibility({orgId,discoverable:true});
 const reqs=api.query(collection(owner.db,`organizations/${orgId}/joinRequests`),api.where('status','==','pending'),api.limit(100));
 await assertFails(getDocs(api.query(collection(outsider.db,`organizations/${orgId}/joinRequests`),api.where('status','==','pending'),api.limit(100))));
 const values=[],waiters=[];let unsubscribe;
 const next=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timed out waiting for pending request snapshot')),10000);waiters.push(value=>{clearTimeout(timer);resolve(value)});});
 const first=next();unsubscribe=api.onSnapshot(reqs,snap=>{const rows=snap.docs.map(d=>({uid:d.id,...d.data()}));values.push(rows);waiters.shift()?.(rows)});
 try{
  assert.equal((await first).length,0);const appeared=next();await guest.service.orgRequestJoin({orgId});const pending=await appeared;
  assert.equal(pending.length,1);assert.equal(pending[0].uid,'guest');assert.equal(pending[0].displayName,'guest');assert.equal(pending[0].email,'guest@example.test');
  const removed=next();await owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'});assert.equal((await removed).length,0);
 }finally{unsubscribe();}
});

test('approved requester auto-adds their own workspace and account-private notice state',async()=>{
 const {createWorkspaceApprovalTracker}=await import('../workspace-approval.mjs');
 const owner=directory('owner'),guest=directory('guest');const {orgId}=await owner.service.orgCreate({name:'Auto Join Test'});
 await owner.service.orgSetVisibility({orgId,discoverable:true});await setDoc(ref(guest.db,'users/guest'),{orgMemberships:[],activeOrganizationId:null});await guest.service.orgRequestJoin({orgId});
 await assertFails(getDoc(ref(owner.db,`users/guest/organizationRequests/${orgId}`)));
 let done;const received=new Promise(resolve=>done=resolve),events=[];
 const tracker=createWorkspaceApprovalTracker({db:guest.db,api,isCurrent:uid=>uid==='guest',onChange:items=>{events.push(items);if(items.length)done(items[0]);},onMembership:()=>{},onError:err=>console.error(err)});
 try{
  tracker.start('guest');await owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'});
  let timer;const item=await Promise.race([received,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Approval listener timeout')),15000)})]).finally(()=>clearTimeout(timer));
  assert.equal(item.orgId,orgId);assert.equal(item.newSeen,false);assert.equal(item.read,false);
  const profile=(await getDoc(ref(guest.db,'users/guest'))).data();assert.deepEqual(profile.orgMemberships,[orgId]);assert.equal(profile.activeOrganizationId,null);
  await tracker.markSeen(orgId,item.key);await tracker.markRead(orgId,item.key);
  const row=(await getDoc(ref(guest.db,`users/guest/organizationRequests/${orgId}`))).data();assert.equal(row.approvalNewSeen,true);assert.equal(row.approvalNoticeRead,true);
  await assertFails(updateDoc(ref(owner.db,`users/guest/organizationRequests/${orgId}`),{approvalNoticeRead:false}));
 }finally{tracker.stop();}
});
