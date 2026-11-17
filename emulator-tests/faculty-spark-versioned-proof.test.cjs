'use strict';
// The rules used here are an experiment, never the production ruleset.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const api=require('firebase/firestore');const {doc,setDoc,getDoc,serverTimestamp}=api;
const {createIntegratedClient}=require('../faculty-fund-spark-client.js'),{createSparkReader}=require('../faculty-fund-spark-read.js'),{projectFacultySpark}=require('../faculty-fund-spark-projection.js');
const PROJECT='demo-pondo-security',root='organizations/school';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback emulator first');
let env;
test.before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-versioned-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['reviewer','reviewer']])await setDoc(doc(db,`${root}/members/${uid}`),{uid,role});});});
test.after(async()=>{if(env)await env.cleanup()});
const db=uid=>env.authenticatedContext(uid).firestore(),ref=(d,p)=>doc(d,`${root}/${p}`),client=(d,uid)=>createIntegratedClient({db:d,api,orgId:'school',uid,useRevision:true});
const reader=(d,opts={})=>createSparkReader({db:d,api:opts.api||api,orgId:'school',isCurrent:opts.isCurrent||(()=>true),project:projectFacultySpark,maxDocuments:opts.maxDocuments||1000});
async function base(){const owner=db('owner'),aoDb=db('ao'),presDb=db('president'),ownerClient=client(owner,'owner'),ao=client(aoDb,'ao'),pres=client(presDb,'president');await ownerClient.assignPresident('president','assign1');await ao.createPerson('teacher','Ana');return {owner,aoDb,presDb,ownerClient,ao,pres};}

test('versioned client writes are atomic, monotonic and do not advance on retry',async()=>{
 const {aoDb,ao,pres}=await base();const afterBase=(await getDoc(ref(aoDb,'sparkRevision/current'))).data().revision;assert.equal(afterBase,2);assert.equal((await ao.createPerson('teacher','Ana')).replayed,true);assert.equal((await getDoc(ref(aoDb,'sparkRevision/current'))).data().revision,2);
 await ao.createPayment('p',{personId:'teacher',absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:25000});await ao.createRemittance('r',['p']);await ao.addPayment('r','p');await ao.submitRemittance('r');await pres.accept('r');
 const at=(await getDoc(ref(aoDb,'sparkWallets/r'))).data().acceptedAt;await ao.createExpense('e',{amountCents:10000,description:'Books',payee:'Store',occurredAt:at});await ao.allocate('e','r','a',10000);await ao.finalizeExpense('e');
 const view=await reader(aoDb).read();assert.equal(view.revision,10);assert.equal(view.projection.receivedCents,25000);assert.equal(view.projection.spentCents,10000);assert.equal(view.projection.spendableCents,15000);
});

test('financial writes without a matching revision, false timestamps and unauthorized revisions fail',async()=>{
 const aoDb=db('ao'),reviewer=db('reviewer');await assertFails(setDoc(ref(aoDb,'sparkPeople/test'),{name:'Test',createdBy:'ao',createdAt:serverTimestamp()}));await assertFails(setDoc(ref(reviewer,'sparkRevision/current'),{revision:1,updatedBy:'reviewer',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(aoDb,'sparkRevision/current'),{revision:2,updatedBy:'ao',updatedAt:serverTimestamp()}));await assertFails(setDoc(ref(aoDb,'sparkRevision/current'),{revision:1,updatedBy:'ao',updatedAt:new Date('2020-01-01')}));
 const ao=client(aoDb,'ao');await ao.createPerson('test','Test');await assertFails(setDoc(ref(aoDb,'sparkPeople/other'),{name:'Other',createdBy:'ao',createdAt:serverTimestamp()}));
});

test('reader refuses concurrent financial changes and a changed workspace',async()=>{
 const {aoDb,ao}=await base();let injected=false;
 const racing={...api,getDocsFromServer:async q=>{const snap=await api.getDocsFromServer(q);if(!injected){injected=true;await ao.createPerson('new','New teacher');}return snap;}};
 await assert.rejects(reader(aoDb,{api:racing}).read(),/changed while loading/);
 let active=true;const switching={...api,getDocsFromServer:async q=>{const snap=await api.getDocsFromServer(q);active=false;return snap;}};
 await assert.rejects(reader(aoDb,{api:switching,isCurrent:()=>active}).read(),/Workspace changed/);
});

test('reader rejects cached or pending data, excessive collections, and missing revision controls',async()=>{
 const {aoDb,ao}=await base();const cached={...api,getDocsFromServer:async q=>{const snap=await api.getDocsFromServer(q);return {metadata:{fromCache:true,hasPendingWrites:false},docs:snap.docs,size:snap.size};}};await assert.rejects(reader(aoDb,{api:cached}).read(),/not server-confirmed/);
 await ao.createPerson('second','Second');await assert.rejects(reader(aoDb,{maxDocuments:1}).read(),/safe loading limit/);
 await env.withSecurityRulesDisabled(async c=>api.deleteDoc(ref(c.firestore(),'sparkRevision/current')));await assert.rejects(reader(aoDb).read(),/revision is missing/);
});

test('versioned snapshots produce separate receipts and a scoped cash report',async()=>{
 const {aoDb,ao,pres}=await base(),{createSparkReceiptView}=require('../faculty-fund-spark-receipts.js'),{makeSparkReport,sparkReportCsv}=require('../faculty-fund-spark-report.js');
 await ao.createPayment('p',{personId:'teacher',absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:25000});await ao.createRemittance('r',['p']);await ao.addPayment('r','p');await ao.submitRemittance('r');await pres.accept('r');
 let snapshot=await reader(aoDb).read(),view=createSparkReceiptView(snapshot,{organizationName:'School'});assert.deepEqual(view.unprinted(),['p']);assert.match(view.remittanceHtml('r'),/₱250\.00/);assert.match(view.membersHtml(['p']),/Ana/);assert.equal(makeSparkReport(snapshot).receivedCents,25000);
 await ao.confirmPrint('member','p','r');snapshot=await reader(aoDb).read();view=createSparkReceiptView(snapshot);assert.deepEqual(view.unprinted(),[]);assert.equal(view.remittancePrinted('r'),false);await ao.confirmPrint('remittance','r');snapshot=await reader(aoDb).read();assert.equal(createSparkReceiptView(snapshot).remittancePrinted('r'),true);assert.match(sparkReportCsv(makeSparkReport(snapshot)),/250\.00/);
});

test('rules reject impossible dates and future Philippine payment dates even from a modified client',async()=>{
 const {aoDb,ao}=await base();
 async function rawPayment(id,absenceDate,paymentDate){
  const slotId='teacher~'+absenceDate,marker=await getDoc(ref(aoDb,'sparkRevision/current')),n=marker.data().revision,b=api.writeBatch(aoDb);
  b.set(ref(aoDb,'sparkPayments/'+id),{slotId,personId:'teacher',memberName:'Ana',absenceDate,paymentDate,amountCents:25000,createdAt:serverTimestamp(),createdBy:'ao',remittanceId:null,voidedAt:null,voidedBy:null,voidReason:null});
  b.set(ref(aoDb,'sparkPaymentSlots/'+slotId),{personId:'teacher',absenceDate,activePaymentId:id,revision:1});b.set(ref(aoDb,'sparkRevision/current'),{revision:n+1,updatedAt:serverTimestamp(),updatedBy:'ao'});return b.commit();
 }
 await assertFails(rawPayment('invalid1','2026-02-29','2026-01-02'));await assertFails(rawPayment('invalid2','2024-04-31','2024-01-02'));await assertFails(rawPayment('invalid3','2024-02-29','2024-02-30'));await assertFails(rawPayment('future','2024-02-29','2099-01-01'));
 await ao.createPayment('leap',{personId:'teacher',absenceDate:'2024-02-29',paymentDate:'2024-03-01',amountCents:25000});assert.equal((await getDoc(ref(aoDb,'sparkPayments/leap'))).exists(),true);
});

test('President assignments are owner-only, linked to immutable audit records and safely retried',async()=>{
 const {owner,aoDb,ownerClient}=await base(),revision=ref(owner,'sparkRevision/current');
 assert.equal((await ownerClient.assignPresident('president','assign1')).replayed,true);
 const b=api.writeBatch(owner),rev=(await getDoc(revision)).data().revision;b.set(ref(owner,'sparkConfig/current'),{presidentUid:'reviewer',assignedBy:'owner',assignedAt:serverTimestamp(),assignmentId:'fake'});b.set(revision,{revision:rev+1,updatedAt:serverTimestamp(),updatedBy:'owner'});await assertFails(b.commit());
 await ownerClient.assignPresident('reviewer','assign2');await ownerClient.assignPresident('president','assign3');const old=await ownerClient.assignPresident('reviewer','assign2');assert.equal(old.replayed,true);assert.equal(old.currentlyAssigned,false);
 const snapshot=await reader(aoDb).read();assert.equal(snapshot.config.presidentUid,'president');assert.equal(snapshot.records.presidentHistory.length,3);const audit=snapshot.records.presidentHistory.find(x=>x.id==='assign2');assert.equal(audit.previousPresidentUid,'president');assert.equal(audit.presidentUid,'reviewer');await assertFails(api.deleteDoc(ref(owner,'sparkPresidentHistory/assign2')));
});

test('reader refuses a President assignment that no longer matches its protected history',async()=>{
 const {aoDb}=await base();await env.withSecurityRulesDisabled(async c=>api.updateDoc(ref(c.firestore(),'sparkConfig/current'),{presidentUid:'reviewer'}));await assert.rejects(reader(aoDb).read(),/assignment history is inconsistent/);
});
