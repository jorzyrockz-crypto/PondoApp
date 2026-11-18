'use strict';
// An isolated security proof, NOT an app backup/restore implementation.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const f=require('firebase/firestore');let env;const org='restore-proof-school';
const ref=(db,o,p)=>f.doc(db,`organizations/${o}/${p}`),db=uid=>env.authenticatedContext(uid).firestore();
test.before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pondo-security',firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-restore-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const o of [org,'other']){await f.setDoc(ref(d,o,'members/owner'),{role:'owner'});await f.setDoc(ref(d,o,'members/member'),{role:'reviewer'});await f.setDoc(ref(d,o,'restoreProofRevision/current'),{revision:7});await f.setDoc(ref(d,o,'restoreProofRecords/accepted'),{status:'accepted',acceptedBy:'president',amountCents:1000});}})});
test.after(async()=>env&&env.cleanup());
async function backup(d,o=org,b='saved'){await f.setDoc(ref(d,o,'restoreProofBackups/'+b),{revision:7,createdBy:'owner',createdAt:f.serverTimestamp()});}
async function lock(d,o=org,b='saved'){await f.setDoc(ref(d,o,'restoreProofLock/current'),{backup:b,revision:7,createdBy:'owner'});}
async function adminDelete(o,id){await env.withSecurityRulesDisabled(async c=>f.deleteDoc(ref(c.firestore(),o,'restoreProofRecords/'+id)));}
test('a copy must match the real source at the saved revision and remains immutable',async()=>{
 const d=db('owner'),entry=ref(d,org,'restoreProofBackups/saved/entries/accepted');await backup(d);
 await assertFails(f.setDoc(entry,{status:'accepted',acceptedBy:'attacker',amountCents:1000}));await assertSucceeds(f.setDoc(entry,{status:'accepted',acceptedBy:'president',amountCents:1000}));
 await assertFails(f.updateDoc(entry,{amountCents:99999}));await assertFails(f.deleteDoc(entry));await assertFails(f.setDoc(ref(db('member'),org,'restoreProofBackups/no'),{revision:7,createdBy:'member',createdAt:f.serverTimestamp()}));
});
test('owner can restore only the exact missing record, never overwrite or forge an acceptance',async()=>{
 const d=db('owner'),entry=ref(d,org,'restoreProofBackups/saved/entries/accepted'),target=ref(d,org,'restoreProofRecords/accepted');await backup(d);await f.setDoc(entry,{status:'accepted',acceptedBy:'president',amountCents:1000});await lock(d);
 await assertFails(f.setDoc(target,{status:'accepted',acceptedBy:'president',amountCents:1000}));await adminDelete(org,'accepted');
 await assertFails(f.setDoc(target,{status:'accepted',acceptedBy:'attacker',amountCents:1000}));await assertFails(f.setDoc(ref(db('member'),org,'restoreProofRecords/accepted'),{status:'accepted',acceptedBy:'president',amountCents:1000}));
 await assertSucceeds(f.setDoc(target,{status:'accepted',acceptedBy:'president',amountCents:1000}));assert.equal((await f.getDoc(target)).data().acceptedBy,'president');
 await assertFails(f.updateDoc(ref(d,org,'restoreProofRevision/current'),{revision:8}));await assertFails(f.deleteDoc(ref(d,org,'restoreProofLock/current')));
});
test('stale, unbacked and cross-workspace recovery fail closed',async()=>{
 const d=db('owner');await backup(d);await f.setDoc(ref(d,org,'restoreProofBackups/saved/entries/accepted'),{status:'accepted',acceptedBy:'president',amountCents:1000});
 await f.updateDoc(ref(d,org,'restoreProofRevision/current'),{revision:8});await assertFails(lock(d));await assertFails(f.setDoc(ref(d,org,'restoreProofBackups/saved/entries/another'),{}));
 await assertFails(lock(d,'other'));await adminDelete(org,'accepted');await assertFails(f.setDoc(ref(d,org,'restoreProofRecords/accepted'),{status:'accepted',acceptedBy:'president',amountCents:1000}));
});
