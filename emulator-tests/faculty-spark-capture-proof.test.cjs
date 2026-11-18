'use strict';
// Isolated demo-project rules proof; not a complete or deployed backup.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const api=require('firebase/firestore'),{createFacultySparkCapture}=require('../faculty-fund-spark-capture.js');
let env;const org='capture-proof',backupId='abcdefghijklmnop',root=`organizations/${org}/`,ref=(db,p)=>api.doc(db,root+p);
const names=['people','payments','slots','remittances','lines','wallets','expenses','allocations','corrections','presidentHistory','memberReceipts','remittanceReceipts'];
test.before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pondo-security',firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-capture-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await api.setDoc(ref(d,'members/owner'),{role:'owner'});await api.setDoc(ref(d,'members/reviewer'),{role:'reviewer'});await api.setDoc(ref(d,'sparkDiscoveryRevision/current'),{revision:5});await api.setDoc(ref(d,'sparkDiscoveryConfig/current'),{presidentUid:'president'});await api.setDoc(ref(d,'sparkDiscoveryPayments/p'),{amountCents:100,acceptedBy:'president',createdAt:api.Timestamp.fromMillis(1700000000000)});});});
test.after(async()=>env&&env.cleanup());
const auth=uid=>env.authenticatedContext(uid).firestore();
test('client copies actual source records at one revision; immutable copies cannot be forged',async()=>{
 const d=auth('owner'),records=Object.fromEntries(names.map(x=>[x,[]]));records.payments=[{id:'p'}];const captured={revision:5,records,projection:{},config:{presidentUid:'president'}};
 const actor=()=>({orgId:org,uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1});const capture=createFacultySparkCapture({db:d,api,getContext:actor,makeReader:()=>({read:async()=>captured})});
 assert.equal((await capture.capture({orgId:org,backupId})).status,'copies-created-not-restorable');assert.equal((await capture.capture({orgId:org,backupId})).count,2);
 const entry=ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryPayments/entries/p`);assert.equal((await api.getDocFromServer(entry)).data().acceptedBy,'president');await assertFails(api.updateDoc(entry,{acceptedBy:'attacker'}));await assertFails(api.deleteDoc(entry));
 await assertFails(api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryPayments/entries/missing`),{amountCents:100}));
 await assertFails(api.getDoc(ref(auth('reviewer'),`sparkVerifiedBackups/${backupId}`)));
});
test('rules reject forged copies, unrelated collections and old revisions',async()=>{
 const d=auth('owner');await api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}`),{revision:5,createdBy:'owner',createdAt:api.serverTimestamp(),manifest:['sparkDiscoveryPayments/p','sparkDiscoveryConfig/current']});
 await assertFails(api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryPayments/entries/p`),{amountCents:999,acceptedBy:'attacker'}));
 await assertFails(api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/members/entries/owner`),{role:'owner'}));
 await env.withSecurityRulesDisabled(async c=>api.setDoc(ref(c.firestore(),'sparkDiscoveryRevision/current'),{revision:6}));
 await assertFails(api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryConfig/entries/current`),{presidentUid:'president'}));
});

test('full synthetic capture and interrupted missing-record restore uses actual reader and rules',async()=>{
 const {createSparkReader}=require('../faculty-fund-spark-read.js'),{projectFacultySpark:project}=require('../faculty-fund-spark-projection.js'),{planFacultySparkCapture:plan,canonicalFacultySparkCapture:canonical}=require('../faculty-fund-spark-capture.js'),{createFacultySparkRestore}=require('../faculty-fund-spark-restore.js');
 // A minimal valid source ledger: one person, no config or financial activity.
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await api.deleteDoc(ref(d,'sparkDiscoveryConfig/current'));await api.deleteDoc(ref(d,'sparkDiscoveryPayments/p'));await api.setDoc(ref(d,'sparkDiscoveryPeople/person'),{name:'Ana'});});
 const d=auth('owner'),context=()=>({orgId:org,uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1}),makeReader=(c,isCurrent)=>createSparkReader({db:d,api,orgId:c.orgId,isCurrent,project,trackRemittanceReleases:true});
 const capture=createFacultySparkCapture({db:d,api,getContext:context,makeReader});await capture.capture({orgId:org,backupId});
 await env.withSecurityRulesDisabled(async c=>api.deleteDoc(ref(c.firestore(),'sparkDiscoveryPeople/person')));
 let calls=0;const flaky={...api,runTransaction:async(...args)=>{const result=await api.runTransaction(...args);if(++calls===2)throw Error('Lost response');return result;}};
 const args={orgId:org,backupId,sessionId:'session123456789'},restore=createFacultySparkRestore({db:d,api:flaky,getContext:context,makeReader,project,plan,canonical});
 await assert.rejects(restore.restore(args),/Lost response/);assert.equal((await api.getDocFromServer(ref(d,'sparkRestoreProof/current'))).data().remaining,0);
 assert.equal((await restore.restore(args)).status,'experiment-restored');assert.equal((await api.getDocFromServer(ref(d,'sparkDiscoveryPeople/person'))).data().name,'Ana');assert.equal((await api.getDocFromServer(ref(d,'sparkRestoreProof/current'))).exists(),false);assert.equal((await restore.restore(args)).status,'experiment-already-restored');
});

test('recovery lock cannot be started or finished without its matching session and claimed copies',async()=>{
 const d=auth('owner'),header=ref(d,`sparkVerifiedBackups/${backupId}`),lock=ref(d,'sparkRestoreProof/current');
 await api.setDoc(header,{revision:5,createdBy:'owner',createdAt:api.serverTimestamp(),manifest:['sparkDiscoveryConfig/current']});
 await api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryConfig/entries/current`),{presidentUid:'president'});
 const sessionId='session123456789',state={backupId,sessionId,revision:5,remaining:1,createdBy:'owner',lastKind:null,lastId:null};await assertFails(api.setDoc(lock,state));
 const b=api.writeBatch(d);b.set(lock,state);b.set(ref(d,'sparkRestoreProofSessions/'+sessionId),{backupId,revision:5,createdBy:'owner',state:'active'});await b.commit();
 await assertFails(api.deleteDoc(lock));await assertFails(api.updateDoc(lock,{remaining:0,lastKind:'sparkDiscoveryConfig',lastId:'current'}));
 await assertFails(api.setDoc(ref(d,`sparkRestoreProof/current/sessions/${sessionId}/collections/sparkDiscoveryConfig/entries/current`),{done:true}));
});
