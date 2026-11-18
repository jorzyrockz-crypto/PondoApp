'use strict';
// In-memory merged rules proof, not the deployed app or rules candidate.
const test=require('node:test'),assert=require('node:assert/strict'),{initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing'),api=require('firebase/firestore');
const {rules}=require('./faculty-spark-integrated-restore.rules.cjs'),{createIntegratedClient}=require('../faculty-fund-spark-client.js'),{createSparkReader}=require('../faculty-fund-spark-read.js'),{projectFacultySpark:project}=require('../faculty-fund-spark-projection.js'),{createFacultySparkCapture,planFacultySparkCapture:plan,canonicalFacultySparkCapture:canonical}=require('../faculty-fund-spark-capture.js'),{createFacultySparkRestore}=require('../faculty-fund-spark-restore.js');
let env;const org='org~restore school',root=`organizations/${org}/`,ref=(d,p)=>api.doc(d,root+p),auth=uid=>env.authenticatedContext(uid).firestore();
test.before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pondo-security',firestore:{rules:rules()}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['viewer','reviewer']])await api.setDoc(ref(d,'members/'+uid),{uid,role});await api.setDoc(ref(d,'facultyFundRelease/current'),{enabled:true,schema:1});});});
test.after(async()=>env&&env.cleanup());
test('an eight-person workspace can restore lost records without accepting new writes while locked',async()=>{
 const makeClient=uid=>createIntegratedClient({db:auth(uid),api,orgId:org,uid,useRevision:true,trackRemittanceReleases:true}),owner=makeClient('owner'),ao=makeClient('ao'),president=makeClient('president');
 await owner.assignPresident('president','assignment');for(let i=1;i<=8;i++)await ao.createPerson('person'+i,'Teacher '+i);
 await ao.createPayment('payment',{personId:'person1',absenceDate:'2024-01-01',paymentDate:'2024-01-02',amountCents:1000});await ao.createRemittance('remit',['payment']);await ao.addPayment('remit','payment');await ao.submitRemittance('remit');await president.accept('remit');
 const wallet=(await api.getDocFromServer(ref(auth('ao'),'sparkDiscoveryWallets/remit'))).data();await ao.createExpense('expense',{amountCents:400,description:'Books',payee:'Shop',occurredAt:wallet.acceptedAt});await ao.allocate('expense','remit','allocation',400);await ao.finalizeExpense('expense');
 const d=auth('owner'),context=()=>({orgId:org,uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1}),makeReader=(c,isCurrent)=>createSparkReader({db:d,api,orgId:c.orgId,isCurrent,project,trackRemittanceReleases:true});
 const before=await makeReader(context(),()=>true).read();assert.equal(before.records.people.length,8);assert.equal(before.projection.balanceCents,600);assert.equal(before.projection.spentCents,400);
 const backupId='integrated-backup-1',sessionId='integrated-session-1';const capture=createFacultySparkCapture({db:d,api,getContext:context,makeReader});await capture.capture({orgId:org,backupId});
 await env.withSecurityRulesDisabled(async c=>{const a=c.firestore();await api.deleteDoc(ref(a,'sparkDiscoveryPayments/payment'));await api.deleteDoc(ref(a,'sparkDiscoveryWallets/remit'));await api.deleteDoc(ref(a,'sparkDiscoveryAllocations/allocation'));});
 let attempts=0;const flaky={...api,runTransaction:async(...args)=>{const result=await api.runTransaction(...args);if(++attempts===1)throw Error('Lost lock response');return result;}};const restore=createFacultySparkRestore({db:d,api:flaky,getContext:context,makeReader,project,plan,canonical}),input={orgId:org,backupId,sessionId};
 await assert.rejects(restore.restore(input),/Lost lock response/);const guarded=createSparkReader({db:d,api,orgId:org,isCurrent:()=>true,project,trackRemittanceReleases:true,checkRestoreLock:true});await assert.rejects(guarded.read(),/restore is in progress/);await assertFails(ao.createPerson('blocked','Blocked'));assert.equal((await api.getDocFromServer(ref(d,'sparkRestoreProof/current'))).exists(),true);
 await restore.restore(input);const after=await makeReader(context(),()=>true).read();assert.equal(after.projection.balanceCents,600);assert.equal(after.projection.spentCents,400);assert.equal(after.records.people.length,8);assert.equal(after.records.remittances[0].acceptedBy,'president');assert.equal(after.records.payments.length,1);assert.equal(after.records.allocations.length,1);assert.equal(after.revision,before.revision+2);
 await ao.createPerson('after','After');assert.equal((await makeReader(context(),()=>true).read()).records.people.length,9);
});
test('stale backups and forged historical records cannot be restored',async()=>{
 const makeClient=uid=>createIntegratedClient({db:auth(uid),api,orgId:org,uid,useRevision:true,trackRemittanceReleases:true}),owner=makeClient('owner'),ao=makeClient('ao');await owner.assignPresident('president','assignment');await ao.createPerson('person','Teacher');
 const d=auth('owner'),context=()=>({orgId:org,uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1}),makeReader=(c,isCurrent)=>createSparkReader({db:d,api,orgId:c.orgId,isCurrent,project,trackRemittanceReleases:true}),backupId='integrated-backup-2',sessionId='integrated-session-2';
 await createFacultySparkCapture({db:d,api,getContext:context,makeReader}).capture({orgId:org,backupId});
 await assertFails(api.updateDoc(ref(d,`sparkVerifiedBackups/${backupId}/collections/sparkDiscoveryPresidentHistory/entries/assignment`),{presidentUid:'viewer'}));
 const viewer=auth('viewer');await assertFails(api.getDoc(ref(viewer,`sparkVerifiedBackups/${backupId}`)));
 await ao.createPerson('another','Another');const restore=createFacultySparkRestore({db:d,api,getContext:context,makeReader,project,plan,canonical});await assert.rejects(restore.restore({orgId:org,backupId,sessionId}),/stale/);assert.equal((await api.getDocFromServer(ref(d,'sparkRestoreProof/current'))).exists(),false);
});
