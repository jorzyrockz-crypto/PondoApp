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
 const d=auth('owner'),context=()=>({orgId:org,uid:'owner',role:'owner',memberConfirmed:true,scopeToken:1}),makeReader=(c,isCurrent)=>createSparkReader({db:d,api,orgId:c.orgId,isCurrent,project,trackRemittanceReleases:true});
 const before=await makeReader(context(),()=>true).read();assert.equal(before.records.people.length,8);assert.equal(before.projection.balanceCents,1000);
 const backupId='integrated-backup-1',sessionId='integrated-session-1';const capture=createFacultySparkCapture({db:d,api,getContext:context,makeReader});await capture.capture({orgId:org,backupId});
 await env.withSecurityRulesDisabled(async c=>{const a=c.firestore();await api.deleteDoc(ref(a,'sparkDiscoveryPayments/payment'));await api.deleteDoc(ref(a,'sparkDiscoveryWallets/remit'));});
 let attempts=0;const flaky={...api,runTransaction:async(...args)=>{const result=await api.runTransaction(...args);if(++attempts===1)throw Error('Lost lock response');return result;}};const restore=createFacultySparkRestore({db:d,api:flaky,getContext:context,makeReader,project,plan,canonical}),input={orgId:org,backupId,sessionId};
 await assert.rejects(restore.restore(input),/Lost lock response/);await assertFails(ao.createPerson('blocked','Blocked'));assert.equal((await api.getDocFromServer(ref(d,'sparkRestoreProof/current'))).exists(),true);
 await restore.restore(input);const after=await makeReader(context(),()=>true).read();assert.equal(after.projection.balanceCents,1000);assert.equal(after.records.people.length,8);assert.equal(after.records.remittances[0].acceptedBy,'president');assert.equal(after.records.payments.length,1);assert.equal(after.revision,before.revision+2);
 await ao.createPerson('after','After');assert.equal((await makeReader(context(),()=>true).read()).records.people.length,9);
});
