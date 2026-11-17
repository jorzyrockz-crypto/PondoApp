'use strict';
// Isolated proof: the production rules and app are intentionally untouched.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteDoc,getDoc,writeBatch,serverTimestamp,runTransaction}=require('firebase/firestore');
const PROJECT='demo-pondo-security',root='organizations/school';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback Firestore emulator first');
let env;
test.before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['reviewer','reviewer']])await setDoc(doc(db,`${root}/members/${uid}`),{uid,role});});
});
test.after(async()=>{if(env)await env.cleanup()});
const client=uid=>env.authenticatedContext(uid).firestore();
const d=(db,p)=>doc(db,`${root}/${p}`);
async function setup(){const owner=client('owner');await assertSucceeds(setDoc(d(owner,'sparkConfig/current'),{presidentUid:'president',assignedAt:serverTimestamp(),assignedBy:'owner'}));await assertSucceeds(setDoc(d(owner,'sparkLedger/current'),{balanceCents:0,revision:0,lastKind:'init',lastId:''}));}
async function makePayment(db,id='person1~2026-01-01',amount=25000){return setDoc(d(db,'sparkPayments/'+id),{personId:id.split('~')[0],absenceDate:id.split('~')[1],paymentDate:'2026-01-02',amountCents:amount,createdAt:serverTimestamp(),createdBy:'ao',remittanceId:null});}
async function makeDraft(db,id='r'){return setDoc(d(db,'sparkRemittances/'+id),{status:'draft',amountCents:0,count:0,lastPaymentId:null,createdBy:'ao',createdAt:serverTimestamp()});}
async function add(db,p,r='r',amount=25000,count=1,previous=0){let b=writeBatch(db);b.update(d(db,'sparkPayments/'+p),{remittanceId:r});b.update(d(db,'sparkRemittances/'+r),{count,amountCents:previous+amount,lastPaymentId:p});return b.commit();}
async function submit(db,r='r'){return updateDoc(d(db,'sparkRemittances/'+r),{status:'pending',presidentUid:'president',submittedAt:serverTimestamp()});}
async function accept(db,r='r',balance=25000,revision=1){let b=writeBatch(db);b.update(d(db,'sparkRemittances/'+r),{status:'accepted',acceptedBy:'president',acceptedAt:serverTimestamp()});b.update(d(db,'sparkLedger/current'),{balanceCents:balance,revision,lastKind:'accept',lastId:r});return b.commit();}
async function spend(db,e,amount){return runTransaction(db,async tx=>{const l=d(db,'sparkLedger/current'),s=await tx.get(l),v=s.data();tx.set(d(db,'sparkExpenses/'+e),{amountCents:amount,description:'Supplies',createdAt:serverTimestamp(),createdBy:'ao'});tx.update(l,{balanceCents:v.balanceCents-amount,revision:v.revision+1,lastKind:'expense',lastId:e});});}

test('draft links each payment atomically and only the assigned President can accept',async()=>{
 await setup();const ao=client('ao'),president=client('president'),reviewer=client('reviewer');
 await assertSucceeds(makePayment(ao));await assertSucceeds(makePayment(ao,'person2~2026-01-02',30000));await assertSucceeds(makeDraft(ao));
 await assertFails(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:'r'}));
 await assertFails(updateDoc(d(ao,'sparkRemittances/r'),{count:1,amountCents:25000,lastPaymentId:'person1~2026-01-01'}));
 await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(add(ao,'person2~2026-01-02','r',30000,2,25000));
 await assertFails(add(ao,'person1~2026-01-01','r',25000,3,55000));await assertSucceeds(submit(ao));
 await assertFails(accept(ao,'r',55000));await assertFails(accept(reviewer,'r',55000));
 await assertFails(updateDoc(d(president,'sparkRemittances/r'),{status:'accepted',acceptedBy:'president',acceptedAt:serverTimestamp()}));
 await assertSucceeds(accept(president,'r',55000));const snapshot=await getDoc(d(president,'sparkRemittances/r'));
 assert.equal(snapshot.data().amountCents,55000);assert.equal(snapshot.data().acceptedBy,'president');assert.ok(snapshot.data().acceptedAt.toDate() instanceof Date);
 await assertFails(accept(president,'r',110000,2));await assertFails(deleteDoc(d(ao,'sparkRemittances/r')));
});

test('forged totals and overspending fail, including concurrent expense transactions',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));
 await assertFails(add(ao,'person1~2026-01-01','r',99999));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));
 await assertFails(spend(ao,'before',1));await assertFails(accept(president,'r',25001));await assertSucceeds(accept(president));
 await assertFails(spend(ao,'too-large',25001));
 const results=await Promise.allSettled([spend(ao,'one',20000),spend(ao,'two',20000)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await getDoc(d(ao,'sparkLedger/current'))).data().balanceCents,5000);
 await assertFails(updateDoc(d(ao,'sparkLedger/current'),{balanceCents:100000,revision:3,lastKind:'expense',lastId:'fake'}));
});

test('assignment, decline, field integrity, and membership are checked by rules',async()=>{
 await setup();const ao=client('ao'),president=client('president'),reviewer=client('reviewer'),owner=client('owner'),outsider=client('outsider');
 await assertFails(setDoc(d(ao,'sparkConfig/current'),{presidentUid:'ao',assignedBy:'ao',assignedAt:serverTimestamp()}));
 await assertFails(makePayment(reviewer));await assertFails(makePayment(outsider));await assertFails(getDoc(d(outsider,'sparkLedger/current')));
 await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));
 await assertFails(updateDoc(d(ao,'sparkRemittances/r'),{status:'declined',declinedBy:'president',declinedAt:serverTimestamp(),reason:'No'}));
 await assertFails(updateDoc(d(president,'sparkRemittances/r'),{status:'declined',declinedBy:'president',declinedAt:serverTimestamp(),reason:''}));
 await assertSucceeds(updateDoc(d(president,'sparkRemittances/r'),{status:'declined',declinedBy:'president',declinedAt:serverTimestamp(),reason:'Amount not handed over'}));
 await assertFails(updateDoc(d(president,'sparkRemittances/r'),{status:'pending'}));
 await env.withSecurityRulesDisabled(async c=>deleteDoc(d(c.firestore(),'members/president')));
 await assertFails(getDoc(d(president,'sparkRemittances/r')));assert.equal((await getDoc(d(owner,'sparkLedger/current'))).data().balanceCents,0);
});

test('two payments cannot share one forged draft increment',async()=>{
 await setup();const ao=client('ao');await assertSucceeds(makePayment(ao));await assertSucceeds(makePayment(ao,'person2~2026-01-01'));await assertSucceeds(makeDraft(ao));
 const b=writeBatch(ao);b.update(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:'r'});b.update(d(ao,'sparkPayments/person2~2026-01-01'),{remittanceId:'r'});b.update(d(ao,'sparkRemittances/r'),{count:1,amountCents:25000,lastPaymentId:'person1~2026-01-01'});await assertFails(b.commit());
 assert.equal((await getDoc(d(ao,'sparkRemittances/r'))).data().amountCents,0);assert.equal((await getDoc(d(ao,'sparkPayments/person2~2026-01-01'))).data().remittanceId,null);
});

test('reassignment invalidates old addressed approvals; acceptance timestamp cannot be faked',async()=>{
 await setup();const ao=client('ao'),president=client('president'),reviewer=client('reviewer'),owner=client('owner');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));
 let b=writeBatch(president);b.update(d(president,'sparkRemittances/r'),{status:'accepted',acceptedBy:'president',acceptedAt:new Date('2020-01-01')});b.update(d(president,'sparkLedger/current'),{balanceCents:25000,revision:1,lastKind:'accept',lastId:'r'});await assertFails(b.commit());
 await assertSucceeds(setDoc(d(owner,'sparkConfig/current'),{presidentUid:'reviewer',assignedBy:'owner',assignedAt:serverTimestamp()}));
 await assertFails(accept(president));b=writeBatch(reviewer);b.update(d(reviewer,'sparkRemittances/r'),{status:'accepted',acceptedBy:'reviewer',acceptedAt:serverTimestamp()});b.update(d(reviewer,'sparkLedger/current'),{balanceCents:25000,revision:1,lastKind:'accept',lastId:'r'});await assertFails(b.commit());
 assert.equal((await getDoc(d(owner,'sparkLedger/current'))).data().balanceCents,0);
});

test('expense records must be paired and immutable, and payment amounts cannot be edited',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertFails(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{amountCents:90000}));await assertFails(makePayment(ao));
 await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));await assertSucceeds(accept(president));
 await assertFails(setDoc(d(ao,'sparkExpenses/unpaired'),{amountCents:1,description:'Unpaired',createdAt:serverTimestamp(),createdBy:'ao'}));
 await assertSucceeds(spend(ao,'safe',10000));await assertFails(updateDoc(d(ao,'sparkExpenses/safe'),{amountCents:1}));await assertFails(deleteDoc(d(ao,'sparkExpenses/safe')));
});

test('prototype client retries remain idempotent after committed responses are lost',async()=>{
 await setup();const api=require('firebase/firestore'),{createProofClient}=require('./fixtures/faculty-spark-proof-client.cjs');
 const ao=createProofClient({db:client('ao'),api,orgId:'school',uid:'ao'}),president=createProofClient({db:client('president'),api,orgId:'school',uid:'president'});
 const input={personId:'teacher',absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:25000};
 const p=await ao.payment(input);assert.equal((await ao.payment(input)).replayed,true);await assert.rejects(ao.payment({...input,amountCents:30000}));
 await ao.draft('retrybatch');assert.equal((await ao.draft('retrybatch')).replayed,true);await ao.add('retrybatch',p.paymentId);assert.equal((await ao.add('retrybatch',p.paymentId)).replayed,true);
 await ao.submit('retrybatch');assert.equal((await ao.submit('retrybatch')).replayed,true);await president.accept('retrybatch');assert.equal((await president.accept('retrybatch')).replayed,true);
 await ao.expense('expense-token',10000,'Supplies');assert.equal((await ao.expense('expense-token',10000,'Supplies')).replayed,true);await assert.rejects(ao.expense('expense-token',9000,'Supplies'));
 assert.equal((await getDoc(d(client('ao'),'sparkLedger/current'))).data().balanceCents,15000);
});
