'use strict';
// This suite must never point at a real project. It clears emulator data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch}=require('firebase/firestore');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createService,canonicalName,nameId}=require('../organization-functions/service.cjs');
const {execFileSync}=require('node:child_process');
const PROJECT='demo-pondo-security';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Refusing to run: start the local Firestore emulator first.');
class HttpsError extends Error {constructor(code,message){super(message);this.code=code}}
let env,admin,db;
test.before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});admin=initializeApp({projectId:PROJECT},'pondo-security-test');db=getFirestore(admin)});
test.beforeEach(async()=>env.clearFirestore());
test.after(async()=>{if(admin)await deleteApp(admin);if(env)await env.cleanup()});
const client=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const ref=(c,p)=>doc(c,p);
async function seed(rows){await env.withSecurityRulesDisabled(async context=>{const store=context.firestore();for(const [p,value] of Object.entries(rows))await setDoc(ref(store,p),value)})}
const actor=(uid,data={})=>({auth:{uid,token:{name:uid,email:uid+'@example.test'}},data});
const executeMigration=args=>{let envVars={...process.env,GCLOUD_PROJECT:PROJECT,NODE_PATH:path.join(__dirname,'node_modules')};delete envVars.GOOGLE_APPLICATION_CREDENTIALS;return execFileSync(process.execPath,[path.join(__dirname,'../organization-functions/migrate.cjs'),...args],{encoding:'utf8',env:envVars,timeout:45000,stdio:['ignore','pipe','pipe']})};
const applyMigration=['--apply','--writers-stopped',`--confirm-project=${PROJECT}`];

test('only actual members can read team data; reviewers cannot write; removed members lose access',async()=>{
 await seed({'organizations/school':{name:'School'},'organizations/school/members/owner':{uid:'owner',role:'owner'},'organizations/school/members/reviewer':{uid:'reviewer',role:'reviewer'},'organizations/school/members/editor':{uid:'editor',role:'project-manager'},'organizations/school/data/snapshot':{_syncRevision:1,updatedBy:'owner',funds:[]}});
 const owner=client('owner'),reviewer=client('reviewer'),editor=client('editor'),outsider=client('outsider'),anon=client(null),p='organizations/school/data/snapshot';
 await assertFails(getDoc(ref(anon,p)));await assertFails(getDoc(ref(outsider,p)));await assertSucceeds(getDoc(ref(reviewer,p)));await assertSucceeds(getDoc(ref(editor,p)));
 await assertFails(updateDoc(ref(reviewer,p),{_syncRevision:2,updatedBy:'reviewer'}));await assertFails(updateDoc(ref(editor,p),{_syncRevision:2,updatedBy:'owner'}));
 await assertSucceeds(updateDoc(ref(editor,p),{_syncRevision:2,updatedBy:'editor'}));await assertFails(updateDoc(ref(editor,p),{_syncRevision:2,updatedBy:'editor'}));
 await assertSucceeds(deleteDoc(ref(owner,'organizations/school/members/reviewer')));await assertFails(getDoc(ref(reviewer,p)));
});

test('direct organization, registry and join-request writes cannot bypass trusted functions',async()=>{
 await seed({'organizations/school':{name:'School',discoverable:false},'organizations/school/members/owner':{uid:'owner',role:'owner'},'organizationNames/secret':{key:'school',orgId:'school'},'organizationDirectoryConfig/migration':{ready:true},'organizations/school/joinRequests/guest':{status:'pending'}});
 const owner=client('owner'),guest=client('guest'),anon=client(null);
 await assertFails(setDoc(ref(guest,'organizations/new'),{name:'New',createdBy:'guest'}));
 await assertFails(setDoc(ref(guest,'organizations/new/members/guest'),{uid:'guest',role:'owner'}));
 await assertFails(updateDoc(ref(owner,'organizations/school'),{name:'Other',discoverable:true}));
 for(const c of [anon,guest,owner]){await assertFails(getDoc(ref(c,'organizationNames/secret')));await assertFails(getDoc(ref(c,'organizationDirectoryConfig/migration')));await assertFails(getDoc(ref(c,'organizations/school/joinRequests/guest')))}
 await assertFails(setDoc(ref(guest,'organizations/school/joinRequests/guest'),{status:'approved'}));
 await assertFails(setDoc(ref(guest,'organizations/school/members/guest'),{uid:'guest',role:'reviewer'}));
});

test('invite membership creation must atomically consume a matching live invite',async()=>{
 await seed({'organizations/school':{name:'School'},'organizations/school/members/owner':{uid:'owner',role:'owner'},'invites/invite1':{orgId:'school',createdBy:'owner',role:'reviewer',usedCount:0,maxUses:1,revoked:false,expiresAt:null}});
 const guest=client('guest'),other=client('other');
 await assertFails(setDoc(ref(guest,'organizations/school/members/guest'),{uid:'guest',role:'reviewer',inviteCode:'invite1'}));
 let batch=writeBatch(guest);batch.update(ref(guest,'invites/invite1'),{usedCount:1});batch.set(ref(guest,'organizations/school/members/guest'),{uid:'guest',role:'reviewer',inviteCode:'invite1'});await assertSucceeds(batch.commit());
 batch=writeBatch(other);batch.update(ref(other,'invites/invite1'),{usedCount:2});batch.set(ref(other,'organizations/school/members/other'),{uid:'other',role:'reviewer',inviteCode:'invite1'});await assertFails(batch.commit());
});

test('service transactions preserve uniqueness and approval-gated membership under real concurrent writes',async()=>{
 const service=createService({db,FieldValue,HttpsError});await db.doc('organizationDirectoryConfig/migration').set({ready:true});
 let created=await Promise.allSettled([service.create(actor('owner1',{name:'School Fund'})),service.create(actor('owner2',{name:' school   fund '}))]);
 assert.equal(created.filter(x=>x.status==='fulfilled').length,1);assert.equal(created.find(x=>x.status==='rejected').reason.code,'already-exists');
 let winner=created.findIndex(x=>x.status==='fulfilled'),orgId=created[winner].value.orgId,owner=winner===0?'owner1':'owner2';
 assert.equal((await service.search(actor('guest',{name:'school fund'}))).organization,null);
 await assert.rejects(service.visibility(actor('guest',{orgId,discoverable:true})),{code:'permission-denied'});
 await service.visibility(actor(owner,{orgId,discoverable:true}));await service.request(actor('guest',{orgId}));
 let orgDoc='organizations/'+orgId,guest=client('guest');await assertFails(getDoc(ref(guest,orgDoc)));
 await assert.rejects(service.decide(actor('guest',{orgId,uid:'guest',decision:'approve',role:'owner'})),{code:'invalid-argument'});
 let outcomes=await Promise.allSettled([service.decide(actor(owner,{orgId,uid:'guest',decision:'approve',role:'reviewer'})),service.decide(actor(owner,{orgId,uid:'guest',decision:'reject'}))]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);let membership=await db.doc(`${orgDoc}/members/guest`).get();let request=await db.doc(`${orgDoc}/joinRequests/guest`).get();
 assert.equal(membership.exists,request.data().status==='approved');if(membership.exists){assert.equal(membership.data().role,'reviewer');await assertSucceeds(getDoc(ref(guest,orgDoc)))}else await assertFails(getDoc(ref(guest,orgDoc)));
 await service.visibility(actor(owner,{orgId,discoverable:false}));assert.equal((await service.search(actor('guest2',{name:'School Fund'}))).organization,null);await assert.rejects(service.request(actor('guest2',{orgId})),{code:'not-found'});
});

test('migration audits duplicates without writes, then reserves names and marks existing organizations private',async()=>{
 const execute=executeMigration;
 await db.doc('organizations/a').set({name:' School  Fund ',discoverable:true});await db.doc('organizations/b').set({name:'school fund'});
 assert.throws(()=>execute(['--apply']));assert.throws(()=>execute(['--apply','--writers-stopped','--confirm-project=wrong-project']));
 const apply=applyMigration;assert.throws(()=>execute(apply));assert.equal((await db.doc('organizationDirectoryConfig/migration').get()).exists,false);assert.equal((await db.collection('organizationNames').get()).size,0);assert.equal((await db.doc('organizations/a').get()).data().discoverable,true);
 await db.doc('organizations/b').update({name:'Another organization'});assert.match(execute([]),/Audit only/);assert.equal((await db.collection('organizationNames').get()).size,0);
 assert.match(execute(apply),/Registry ready/);assert.equal((await db.collection('organizationNames').get()).size,2);assert.equal((await db.doc('organizations/a').get()).data().discoverable,false);assert.equal((await db.doc('organizationDirectoryConfig/migration').get()).data().ready,true);assert.throws(()=>execute(apply));
});

test('migration rejects invalid names and conflicting reservations and resumes an interrupted batch',async()=>{
 const key=canonicalName('School').key, reservation=db.doc(`organizationNames/${nameId(key)}`);
 await db.doc('organizations/a').set({name:'School',discoverable:true});
 await db.doc('organizations/b').set({name:''});
 await assert.rejects(async()=>executeMigration(applyMigration),/Command failed/);
 assert.equal((await reservation.get()).exists,false);
 await db.doc('organizations/b').update({name:'Other'});
 await reservation.set({key,orgId:'wrong'});
 assert.throws(()=>executeMigration(applyMigration));
 assert.equal((await db.doc('organizationDirectoryConfig/migration').get()).exists,false);
 assert.equal((await db.doc('organizations/a').get()).data().discoverable,true);
 // Model a completed first batch after interruption, with the marker still absent.
 await reservation.set({key,orgId:'a'});await db.doc('organizations/a').update({discoverable:false});
 assert.match(executeMigration(applyMigration),/Registry ready/);
 assert.equal((await db.collection('organizationNames').get()).size,2);
 assert.equal((await db.doc('organizations/b').get()).data().discoverable,false);
 assert.equal((await db.doc('organizationDirectoryConfig/migration').get()).data().ready,true);
});

test('missing migration marker blocks discovery operations and creates no organization or membership',async()=>{
 const service=createService({db,FieldValue,HttpsError});
 for(const [method,data] of [['create',{name:'School'}],['search',{name:'School'}],['request',{orgId:'school'}],['mine',{}],['visibility',{orgId:'school',discoverable:true}],['pending',{orgId:'school'}],['decide',{orgId:'school',uid:'guest',decision:'reject'}]]){
  await assert.rejects(service[method](actor('owner',data)),{code:'failed-precondition'});
 }
 assert.equal((await db.collection('organizations').get()).size,0);
 assert.equal((await db.collection('organizationNames').get()).size,0);
 // Rate-limit counters may still be written for create/search/request attempts.
});

test('owners only can review requests and revocation immediately removes service and client access',async()=>{
 const service=createService({db,FieldValue,HttpsError});await db.doc('organizationDirectoryConfig/migration').set({ready:true});
 const {orgId}=await service.create(actor('owner',{name:'Team'}));await service.visibility(actor('owner',{orgId,discoverable:true}));
 await service.request(actor('guest',{orgId}));await service.request(actor('guest',{orgId}));
 assert.equal((await service.pending(actor('owner',{orgId}))).requests.length,1);
 await assert.rejects(service.pending(actor('guest',{orgId})),{code:'permission-denied'});
 await assert.rejects(service.decide(actor('guest',{orgId,uid:'guest',decision:'approve',role:'reviewer'})),{code:'permission-denied'});
 await service.decide(actor('owner',{orgId,uid:'guest',decision:'approve',role:'reviewer'}));
 assert.equal((await service.mine(actor('guest'))).requests[0].status,'approved');
 const guest=client('guest'),owner=client('owner'),org=`organizations/${orgId}`;
 await assertSucceeds(getDoc(ref(guest,org)));await assertFails(updateDoc(ref(guest,`${org}/members/guest`),{role:'owner'}));
 await assertSucceeds(deleteDoc(ref(owner,`${org}/members/guest`)));
 assert.equal((await service.mine(actor('guest'))).requests[0].status,'not-a-member');await assertFails(getDoc(ref(guest,org)));
 await assertSucceeds(deleteDoc(ref(owner,`${org}/members/owner`)));
 await assert.rejects(service.pending(actor('owner',{orgId})),{code:'permission-denied'});
 await assert.rejects(service.visibility(actor('owner',{orgId,discoverable:false})),{code:'permission-denied'});
});
