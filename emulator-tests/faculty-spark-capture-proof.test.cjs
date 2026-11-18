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
 const d=auth('owner');await api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}`),{revision:5,createdBy:'owner',createdAt:api.serverTimestamp()});
 await assertFails(api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryPayments/entries/p`),{amountCents:999,acceptedBy:'attacker'}));
 await assertFails(api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/members/entries/owner`),{role:'owner'}));
 await env.withSecurityRulesDisabled(async c=>api.setDoc(ref(c.firestore(),'sparkDiscoveryRevision/current'),{revision:6}));
 await assertFails(api.setDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryConfig/entries/current`),{presidentUid:'president'}));
});
