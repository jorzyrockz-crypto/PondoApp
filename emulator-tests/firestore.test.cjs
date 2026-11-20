'use strict';
// This suite clears only the fixed demo project's loopback emulator.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const api=require('firebase/firestore');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp}=api;
const PROJECT='demo-pondo-security';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Refusing to run: start the local Firestore emulator first.');
// Exercise the same ordinary-workspace security suite under each checked-in
// rules variant. Never accept an arbitrary rules path from the environment.
const variants={configured:'firestore.rules',facultyTest:'firestore.faculty-test.rules',testRecovery:'firestore.faculty-test-recovery-candidate.rules',recoveryCandidate:'firestore.faculty-recovery-candidate.rules'};
const variant=process.env.PONDO_ORGANIZATION_RULES||'configured';
if(!Object.hasOwn(variants,variant))throw Error('Unknown organization rules variant');
let env,createDirectory,organizationName;
test.before(async()=>{({createOrganizationDirectory:createDirectory,organizationName}=await import('../organization-firestore.mjs'));env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'..',variants[variant]),'utf8')}})});
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

test('member refund inbox permits bounded member submissions but not reviewer ledger writes or decisions',async()=>{
 const root='organizations/refund-test',path=root+'/memberRefundRequests/member-refund-123456';
 await seed({[root]:{name:'Refund team'},[root+'/members/owner']:{uid:'owner',role:'owner'},[root+'/members/ao']:{uid:'ao',role:'disbursing'},[root+'/members/viewer']:{uid:'viewer',role:'reviewer'},[root+'/members/manager']:{uid:'manager',role:'project-manager'},[root+'/data/snapshot']:{_syncRevision:1,updatedBy:'owner',payables:[],auditLog:[]}});
 const v=client('viewer'),owner=client('owner'),ao=client('ao'),outsider=client('outsider'),anon=client(null);
 const request={uid:'viewer',description:'Supplies',reimburseTo:'Viewer',amountCents:5000,expenseDate:'2026-01-01',supplier:'',category:'',reference:'',status:'pending',createdAt:serverTimestamp()};
 await assertFails(setDoc(ref(outsider,path),request));await assertFails(setDoc(ref(anon,path),request));await assertFails(setDoc(ref(v,path),{...request,uid:'owner'}));await assertFails(setDoc(ref(v,path),{...request,amountCents:-1}));await assertFails(setDoc(ref(v,path),{...request,receiptImage:'unsafe'}));
 await assertSucceeds(setDoc(ref(v,path),request));await assertSucceeds(getDoc(ref(owner,path)));await assertFails(getDoc(ref(outsider,path)));
 const pending=db=>api.query(collection(db,root+'/memberRefundRequests'),api.where('status','==','pending'),api.limit(101));
 for(const member of [v,owner,ao])assert.equal((await assertSucceeds(getDocs(pending(member)))).size,1);
 await assertFails(getDocs(pending(outsider)));await assertFails(getDocs(pending(anon)));
 // An optional recipient link must name a current team member; legacy unlinked
 // requests remain valid and neither the reviewer nor approver can edit it later.
 const linked=root+'/memberRefundRequests/member-refund-linked-12345';
 await assertFails(setDoc(ref(v,linked),{...request,reimburseToUid:'outsider'}));
 await assertFails(setDoc(ref(v,linked),{...request,reimburseToUid:''}));
 await assertFails(setDoc(ref(v,linked),{...request,reimburseToUid:'viewer/other'}));
 await assertFails(setDoc(ref(v,linked),{...request,reimburseToUid:123}));
 await assertSucceeds(setDoc(ref(v,linked),{...request,reimburseToUid:'viewer'}));
 const itemized=root+'/memberRefundRequests/member-refund-items-12345';
 await assertFails(setDoc(ref(v,itemized),{...request,itemsJSON:123}));await assertFails(setDoc(ref(v,itemized),{...request,itemsJSON:'x'.repeat(10001)}));
 await assertSucceeds(setDoc(ref(v,itemized),{...request,itemsJSON:JSON.stringify([{name:'Paper',qtyMilli:2000,unitCents:2500}])}));await assertFails(updateDoc(ref(v,itemized),{itemsJSON:'[]'}));
 await assertFails(updateDoc(ref(v,linked),{reimburseToUid:'owner'}));
 await assertFails(updateDoc(ref(ao,linked),{status:'approved',decidedBy:'ao',decidedAt:serverTimestamp(),decisionReason:'',reimburseToUid:'owner'}));
 await assertFails(updateDoc(ref(v,path),{description:'tampered'}));await assertFails(updateDoc(ref(v,path),{status:'approved',decidedBy:'viewer',decidedAt:serverTimestamp(),decisionReason:''}));await assertFails(updateDoc(ref(v,root+'/data/snapshot'),{_syncRevision:2,updatedBy:'viewer'}));
 await assertFails(updateDoc(ref(ao,path),{status:'approved',decidedBy:'owner',decidedAt:serverTimestamp(),decisionReason:''}));await assertSucceeds(updateDoc(ref(ao,path),{status:'approved',decidedBy:'ao',decidedAt:serverTimestamp(),decisionReason:''}));await assertFails(updateDoc(ref(owner,path),{status:'rejected',decidedBy:'owner',decidedAt:serverTimestamp(),decisionReason:'duplicate'}));await assertFails(deleteDoc(ref(owner,path)));
 await assertSucceeds(deleteDoc(ref(owner,root+'/members/viewer')));await assertFails(getDoc(ref(v,path)));await assertFails(setDoc(ref(v,root+'/memberRefundRequests/member-refund-987654'),request));
});

test('member request approval transaction creates exactly one unpaid payable and cash stays unchanged',async()=>{
 const {createMemberRefundService}=await import('../member-refund-service.mjs');
 const org='refund-atomic',root='organizations/'+org;
 const ledger={org:{name:'Org'},funds:[],txs:[],sigs:[],projects:[],allocations:[],payables:[],auditLog:[],contributionActivities:[],contributors:[],contributionPayments:[]};
 await seed({[root]:{name:'Team'},[root+'/members/owner']:{uid:'owner',role:'owner'},[root+'/members/ao']:{uid:'ao',role:'disbursing'},[root+'/members/viewer']:{uid:'viewer',role:'reviewer'},[root+'/data/snapshot']:{...ledger,_syncRevision:1,updatedBy:'owner'}});
 const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.keys(v).sort().reduce((a,k)=>(a[k]=sort(v[k]),a),{}):v,stable=v=>JSON.stringify(sort(v));
 const createService=(uid,role)=>{const state={orgId:org,uid,role,memberConfirmed:true,baselineReady:true,online:true,lastSyncedRevision:1,lastSyncedJSON:stable(ledger),members:[{uid:'viewer',displayName:'Viewer'}]};return createMemberRefundService({db:client(uid),api,getState:()=>state,getSnapshot:()=>ledger,stripSnapshot:x=>x,stableJSON:stable,clientId:uid});};
 const viewer=createService('viewer','reviewer'),owner=createService('owner','owner'),ao=createService('ao','disbursing'),id='member-refund-atomic-123';
 const payload={uid:'viewer',description:'Supplies',reimburseTo:'Viewer',reimburseToUid:'viewer',amountCents:25000,expenseDate:'2026-01-01',supplier:'',category:'',reference:''};
 await viewer.submit(org,'viewer',id,payload);await viewer.submit(org,'viewer',id,payload);
 const attempts=await Promise.allSettled([owner.decide(org,'owner',id,'approved','','Owner'),ao.decide(org,'ao',id,'approved','','AO')]);assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 const snapshot=(await getDoc(ref(client('owner'),root+'/data/snapshot'))).data(),request=(await getDoc(ref(client('owner'),root+'/memberRefundRequests/'+id))).data();
 assert.equal(snapshot.payables.length,1);assert.equal(snapshot.auditLog.length,1);assert.equal(snapshot.txs.length,0);assert.equal(snapshot.payables[0].amount,250);assert.equal(snapshot.payables[0].projectId,null);assert.equal(snapshot.payables[0].reimburseToUid,'viewer');assert.equal(request.status,'approved');
});

test('login repair restores only confirmed memberships referenced in the signed-in profile',async()=>{
 const {recoverWorkspaceMemberships}=await import('../workspace-membership-recovery.mjs');const uid='viewer',db=client(uid),team='org~confirmed',removed='org~removed';
 await seed({[`organizations/${team}`]:{name:'Confirmed',createdBy:'owner'},[`organizations/${team}/members/${uid}`]:{uid,role:'reviewer'},[`organizations/${team}/data/snapshot`]:{_syncRevision:1,updatedBy:'owner',payables:[],auditLog:[]},[`organizations/${removed}`]:{name:'Removed',createdBy:'owner'},[`users/${uid}`]:{orgMemberships:[],activeOrganizationId:null},[`users/${uid}/organizationRequests/${team}`]:{orgId:team,name:'Confirmed',created:false},[`users/${uid}/organizationRequests/${removed}`]:{orgId:removed,name:'Removed',created:false}});
 const result=await recoverWorkspaceMemberships({db,api,uid,isCurrent:()=>true,knownIds:[]});assert.deepEqual(result,{ids:[team],partial:false});const profile=(await getDoc(ref(db,`users/${uid}`))).data();assert.deepEqual(profile.orgMemberships,[team]);assert.equal(profile.activeOrganizationId,null);assert.equal((await getDoc(ref(db,`organizations/${team}/data/snapshot`))).data()._syncRevision,1);await assertFails(getDoc(ref(db,`organizations/${removed}`)));
});

test('only an owner can change the bounded workspace display name without changing its search key',async()=>{
 const owner=directory('owner'),viewer=directory('viewer'),other=directory('other');const {orgId}=await owner.service.orgCreate({name:'Registered School'});const root=`organizations/${orgId}`;
 await seed({[`${root}/members/viewer`]:{uid:'viewer',role:'reviewer'}});
 await assertFails(updateDoc(ref(viewer.db,root),{displayName:'Another name'}));await assertFails(updateDoc(ref(other.db,root),{displayName:'Another name'}));
 for(const displayName of ['', ' bad', 'a/b','x'.repeat(121)])await assertFails(updateDoc(ref(owner.db,root),{displayName}));
 await assertSucceeds(updateDoc(ref(owner.db,root),{displayName:'School Team'}));const org=await getDoc(ref(viewer.db,root));assert.equal(org.data().name,'Registered School');assert.equal(org.data().displayName,'School Team');
 await owner.service.orgSetVisibility({orgId,discoverable:true});assert.equal((await other.service.orgSearch({name:'Registered School'})).organization.id,orgId);assert.equal((await other.service.orgSearch({name:'School Team'})).organization,null);
});

test('shared refund receipts are bounded, immutable and limited to workspace members',async()=>{
 const root='organizations/receipt-test',id='member-refund-receipt-12345',requestPath=root+'/memberRefundRequests/'+id,receiptPath=root+'/refundReceipts/'+id,editorPath=root+'/editorRefundReceipts/editor-123';
 await seed({[root]:{name:'Receipts'},[root+'/members/owner']:{uid:'owner',role:'owner'},[root+'/members/viewer']:{uid:'viewer',role:'reviewer'}});
 const viewer=client('viewer'),owner=client('owner'),outsider=client('outsider'),digest='a'.repeat(64),image='data:image/jpeg;base64,YWJj';
 const request={uid:'viewer',description:'Paper',reimburseTo:'Viewer',amountCents:100,expenseDate:'2026-01-01',supplier:'',category:'',reference:'',status:'pending',createdAt:serverTimestamp(),receiptDigest:digest};
 const receipt={uid:'viewer',digest,image,createdAt:serverTimestamp()};
 await assertFails(setDoc(ref(viewer,requestPath),request));await assertFails(setDoc(ref(viewer,receiptPath),receipt));
 let batch=writeBatch(viewer);batch.set(ref(viewer,requestPath),request);batch.set(ref(viewer,receiptPath),{...receipt,digest:'b'.repeat(64)});await assertFails(batch.commit());
 batch=writeBatch(viewer);batch.set(ref(viewer,requestPath),request);batch.set(ref(viewer,receiptPath),{...receipt,image:'data:image/jpeg;base64,'+'A'.repeat(600000)});await assertFails(batch.commit());
 batch=writeBatch(viewer);batch.set(ref(viewer,requestPath),request);batch.set(ref(viewer,receiptPath),receipt);await assertSucceeds(batch.commit());
 // Exercise a near-limit receipt, not just a tiny placeholder; Firestore rules
 // must accept real-size image strings within the declared bound.
 const largeId='member-refund-large-12345',largeImage='data:image/jpeg;base64,'+'A'.repeat(599960);batch=writeBatch(viewer);batch.set(ref(viewer,root+'/memberRefundRequests/'+largeId),request);batch.set(ref(viewer,root+'/refundReceipts/'+largeId),{...receipt,image:largeImage});await assertSucceeds(batch.commit());
 await assertSucceeds(getDoc(ref(owner,receiptPath)));await assertFails(getDoc(ref(outsider,receiptPath)));await assertFails(getDocs(collection(owner,root+'/refundReceipts')));await assertFails(updateDoc(ref(owner,receiptPath),{image}));await assertFails(deleteDoc(ref(owner,receiptPath)));
 const editor={uid:'owner',digest,image,createdAt:serverTimestamp()};await assertFails(setDoc(ref(viewer,editorPath),{...editor,uid:'viewer'}));await assertSucceeds(setDoc(ref(owner,editorPath),editor));await assertSucceeds(getDoc(ref(viewer,editorPath)));await assertFails(getDoc(ref(outsider,editorPath)));await assertFails(updateDoc(ref(owner,editorPath),{image}));await assertFails(deleteDoc(ref(owner,editorPath)));await assertFails(getDocs(collection(owner,root+'/editorRefundReceipts')));
 await assertSucceeds(deleteDoc(ref(owner,root+'/members/viewer')));await assertFails(getDoc(ref(viewer,receiptPath)));await assertFails(getDoc(ref(viewer,editorPath)));
});

test('editor receipt and shared snapshot commit together or both fail on a stale baseline',async()=>{
 const {planEditorRefundReceipts,writeEditorRefundReceipts}=await import('../refund-receipt-sync.mjs');
 const {refundReceiptDigest}=await import('../member-refund-service.mjs');
 const org='editor-receipt-atomic',root='organizations/'+org,db=client('owner');
 const old={payables:[],_syncRevision:1,updatedBy:'owner'};await seed({[root]:{name:'Receipts'},[root+'/members/owner']:{uid:'owner',role:'owner'},[root+'/data/snapshot']:old});
 const image='data:image/jpeg;base64,YWJj',digest=await refundReceiptDigest(image),bill={id:'editor-refund-123',kind:'advance',receiptImage:image,sharedReceiptKind:'editor',sharedReceiptDigest:digest};
 const items=await planEditorRefundReceipts({payables:[bill]},JSON.stringify({payables:[]})),snapshotRef=ref(db,root+'/data/snapshot');
 async function push(expected){return api.runTransaction(db,async tx=>{const prev=await tx.get(snapshotRef);if(prev.data()._syncRevision!==expected)throw Error('stale');const commit=await writeEditorRefundReceipts({transaction:tx,db,doc,serverTimestamp,orgId:org,uid:'owner',items});commit();tx.set(snapshotRef,{payables:[{...bill,receiptImage:null}],_syncRevision:expected+1,updatedBy:'owner'});});}
 await assert.rejects(push(2),/stale/);assert.equal((await getDoc(ref(db,root+'/editorRefundReceipts/'+bill.id))).exists(),false);
 await assertSucceeds(push(1));assert.equal((await getDoc(ref(db,root+'/editorRefundReceipts/'+bill.id))).data().digest,digest);assert.equal((await getDoc(snapshotRef)).data().payables[0].sharedReceiptDigest,digest);
});

test('administrative inventory discovers an orphan nested document without changing Firestore',async()=>{
 const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
 const {inventoryWorkspace}=require('../scripts/workspace-firestore-inventory.cjs');
 const org='org~inventory-test',root='organizations/'+org,orphan=root+'/unexpected/missing-parent/nested/kept';
 await seed({[root]:{name:'Inventory'},[root+'/members/alice']:{uid:'alice',role:'owner'},[orphan]:{secret:'still here'},'users/alice':{orgMemberships:[org],activeOrganizationId:org},['users/alice/organizationRequests/'+org]:{orgId:org},'invites/inventory-code':{orgId:org}});
 const app=initializeApp({projectId:PROJECT},'inventory-test');try{
  const result=await inventoryWorkspace({db:getFirestore(app),orgId:org});
  assert.equal(result.workspaceCollections['unexpected/*/nested'],1);assert.equal(result.missingParentReferences,1);assert.equal(result.accountIndexes.profileMemberships,1);assert.equal(result.accountIndexes.requestIndexes,1);assert.equal(result.externalRecords.invites,1);
  await env.withSecurityRulesDisabled(async context=>assert.equal((await getDoc(ref(context.firestore(),orphan))).data().secret,'still here'));
 }finally{await deleteApp(app)}
});

test('draft reconciliation transaction checks actual membership and server revision',async()=>{
 const {createTeamDraftReconciler}=await import('../team-draft-reconcile.mjs');const {fields,key}=require('../offline-sync.js');
 const blank=()=>Object.fromEntries([['org',{name:'Team'}],...fields.map(k=>[k,[]])]),org='draft-reconcile',root='organizations/'+org,db=client('owner'),s={orgId:org,uid:'owner',role:'owner',recoveryLocked:true,online:true};
 const base=blank();base.funds=[{id:'same',name:'Team'}];const draft=blank();draft.funds=[{id:'same',name:'Draft'},{id:'add',name:'Draft only'}];const raw=JSON.stringify(draft);
 await seed({[root]:{name:'Team'},[root+'/members/owner']:{uid:'owner',role:'owner'},[root+'/members/viewer']:{uid:'viewer',role:'reviewer'},[root+'/data/snapshot']:{...base,_syncRevision:1,updatedBy:'owner'}});
 const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,k)=>(o[k]=x[k],o),{}):x);
 const sharedData=d=>{const {_syncRevision,updatedBy,updatedAt,writerClientId,...rest}=d;return rest};
 const svc=createTeamDraftReconciler({db,api,getState:()=>s,getUser:()=>({uid:'owner'}),getDraft:()=>raw,validate:()=>{},stripSnapshot:x=>x,stableJSON:stable,sharedData,sharedRevision:d=>d?d._syncRevision||0:0,clientId:'test'});
 const choices={[key('funds','same')]:'offline',[key('funds','add')]:'add'},review=await svc.review(org,'owner');await svc.commit(review,choices);let saved=(await getDoc(ref(db,root+'/data/snapshot'))).data();assert.equal(saved._syncRevision,2);assert.deepEqual(saved.funds.map(f=>f.name),['Draft','Draft only']);assert.equal(raw,JSON.stringify(draft));
 const stale=await svc.review(org,'owner');await env.withSecurityRulesDisabled(async c=>updateDoc(ref(c.firestore(),root+'/data/snapshot'),{_syncRevision:3,updatedBy:'owner'}));await assert.rejects(svc.commit(stale,choices),/team copy changed/i);saved=(await getDoc(ref(db,root+'/data/snapshot'))).data();assert.equal(saved._syncRevision,3);
 await env.withSecurityRulesDisabled(async c=>updateDoc(ref(c.firestore(),root+'/members/owner'),{role:'reviewer'}));await assert.rejects(svc.review(org,'owner'));assert.equal((await getDoc(ref(db,root+'/data/snapshot'))).data()._syncRevision,3);
});
