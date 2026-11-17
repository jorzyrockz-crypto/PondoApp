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
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['reviewer','reviewer']])await setDoc(doc(db,`${root}/members/${uid}`),{uid,role});for(const person of ['person1','person2','teacher'])await setDoc(doc(db,`${root}/sparkPeople/${person}`),{name:person,createdBy:'ao',createdAt:new Date('2025-01-01')});});
});
test.after(async()=>{if(env)await env.cleanup()});
const client=uid=>env.authenticatedContext(uid).firestore();
const d=(db,p)=>doc(db,`${root}/${p}`);
async function setup(){const owner=client('owner');await assertSucceeds(setDoc(d(owner,'sparkConfig/current'),{presidentUid:'president',assignedAt:serverTimestamp(),assignedBy:'owner'}));await assertSucceeds(setDoc(d(owner,'sparkLedger/current'),{balanceCents:0,revision:0,lastKind:'init',lastId:'',lastAcceptedAt:null,lastExpenseAt:null}));}
async function makePayment(db,id='person1~2026-01-01',amount=25000){return setDoc(d(db,'sparkPayments/'+id),{personId:id.split('~')[0],memberName:id.split('~')[0],absenceDate:id.split('~')[1],paymentDate:'2026-01-02',amountCents:amount,createdAt:serverTimestamp(),createdBy:'ao',remittanceId:null});}
async function makeDraft(db,id='r'){return setDoc(d(db,'sparkRemittances/'+id),{status:'draft',amountCents:0,count:0,lastPaymentId:null,correctionId:null,createdBy:'ao',createdAt:serverTimestamp()});}
async function add(db,p,r='r',amount=25000,count=1,previous=0){let b=writeBatch(db);b.update(d(db,'sparkPayments/'+p),{remittanceId:r});b.set(d(db,'sparkLines/'+r+'~'+p),{remittanceId:r,paymentId:p,amountCents:amount,linkedAt:serverTimestamp(),linkedBy:'ao'});b.update(d(db,'sparkRemittances/'+r),{count,amountCents:previous+amount,lastPaymentId:p});return b.commit();}
async function submit(db,r='r'){return updateDoc(d(db,'sparkRemittances/'+r),{status:'pending',presidentUid:'president',submittedAt:serverTimestamp()});}
async function accept(db,r='r',balance=25000,revision=1){let b=writeBatch(db);b.update(d(db,'sparkRemittances/'+r),{status:'accepted',acceptedBy:'president',acceptedAt:serverTimestamp()});b.update(d(db,'sparkLedger/current'),{balanceCents:balance,revision,lastKind:'accept',lastId:r,lastAcceptedAt:serverTimestamp()});return b.commit();}
async function spend(db,e,amount){return runTransaction(db,async tx=>{const l=d(db,'sparkLedger/current'),s=await tx.get(l),v=s.data();tx.set(d(db,'sparkExpenses/'+e),{amountCents:amount,description:'Supplies',occurredAt:v.lastAcceptedAt,createdAt:serverTimestamp(),createdBy:'ao'});tx.update(l,{balanceCents:v.balanceCents-amount,revision:v.revision+1,lastKind:'expense',lastId:e,lastExpenseAt:v.lastAcceptedAt});});}

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
 const b=writeBatch(ao);b.update(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:'r'});b.update(d(ao,'sparkPayments/person2~2026-01-01'),{remittanceId:'r'});b.set(d(ao,'sparkLines/r~person1~2026-01-01'),{remittanceId:'r',paymentId:'person1~2026-01-01',amountCents:25000,linkedAt:serverTimestamp(),linkedBy:'ao'});b.set(d(ao,'sparkLines/r~person2~2026-01-01'),{remittanceId:'r',paymentId:'person2~2026-01-01',amountCents:25000,linkedAt:serverTimestamp(),linkedBy:'ao'});b.update(d(ao,'sparkRemittances/r'),{count:1,amountCents:25000,lastPaymentId:'person1~2026-01-01'});await assertFails(b.commit());
 assert.equal((await getDoc(d(ao,'sparkRemittances/r'))).data().amountCents,0);assert.equal((await getDoc(d(ao,'sparkPayments/person2~2026-01-01'))).data().remittanceId,null);
});

test('reassignment invalidates old addressed approvals; acceptance timestamp cannot be faked',async()=>{
 await setup();const ao=client('ao'),president=client('president'),reviewer=client('reviewer'),owner=client('owner');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));
 let b=writeBatch(president);b.update(d(president,'sparkRemittances/r'),{status:'accepted',acceptedBy:'president',acceptedAt:new Date('2020-01-01')});b.update(d(president,'sparkLedger/current'),{balanceCents:25000,revision:1,lastKind:'accept',lastId:'r',lastAcceptedAt:serverTimestamp()});await assertFails(b.commit());
 await assertSucceeds(setDoc(d(owner,'sparkConfig/current'),{presidentUid:'reviewer',assignedBy:'owner',assignedAt:serverTimestamp()}));
 await assertFails(accept(president));b=writeBatch(reviewer);b.update(d(reviewer,'sparkRemittances/r'),{status:'accepted',acceptedBy:'reviewer',acceptedAt:serverTimestamp()});b.update(d(reviewer,'sparkLedger/current'),{balanceCents:25000,revision:1,lastKind:'accept',lastId:'r',lastAcceptedAt:serverTimestamp()});await assertFails(b.commit());
 assert.equal((await getDoc(d(owner,'sparkLedger/current'))).data().balanceCents,0);
});

test('expense records must be paired and immutable, and payment amounts cannot be edited',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertFails(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{amountCents:90000}));await assertFails(makePayment(ao));
 await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));await assertSucceeds(accept(president));
 await assertFails(setDoc(d(ao,'sparkExpenses/unpaired'),{amountCents:1,description:'Unpaired',occurredAt:new Date(),createdAt:serverTimestamp(),createdBy:'ao'}));
 await assertSucceeds(spend(ao,'safe',10000));await assertFails(updateDoc(d(ao,'sparkExpenses/safe'),{amountCents:1}));await assertFails(deleteDoc(d(ao,'sparkExpenses/safe')));
});

test('prototype client retries remain idempotent after committed responses are lost',async()=>{
 await setup();const api=require('firebase/firestore'),{createProofClient}=require('./fixtures/faculty-spark-proof-client.cjs');
 const ao=createProofClient({db:client('ao'),api,orgId:'school',uid:'ao'}),president=createProofClient({db:client('president'),api,orgId:'school',uid:'president'});
 const input={personId:'teacher',absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:25000};
 const p=await ao.payment(input);assert.equal((await ao.payment(input)).replayed,true);await assert.rejects(ao.payment({...input,amountCents:30000}));
 await ao.draft('retrybatch');assert.equal((await ao.draft('retrybatch')).replayed,true);await ao.add('retrybatch',p.paymentId);assert.equal((await ao.add('retrybatch',p.paymentId)).replayed,true);
 await ao.submit('retrybatch');assert.equal((await ao.submit('retrybatch')).replayed,true);await president.accept('retrybatch');assert.equal((await president.accept('retrybatch')).replayed,true);
 const occurredAt=new Date(Math.ceil((await getDoc(d(client('ao'),'sparkLedger/current'))).data().lastAcceptedAt.toMillis()));await ao.expense('expense-token',10000,'Supplies',occurredAt);assert.equal((await ao.expense('expense-token',10000,'Supplies',occurredAt)).replayed,true);await assert.rejects(ao.expense('expense-token',9000,'Supplies',occurredAt));
 assert.equal((await getDoc(d(client('ao'),'sparkLedger/current'))).data().balanceCents,15000);
});


test('cancelled or declined payments can be reused without erasing the historical line',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));
 await assertFails(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:null}));
 await assertSucceeds(updateDoc(d(ao,'sparkRemittances/r'),{status:'cancelled',cancelledBy:'ao',cancelledAt:serverTimestamp(),reason:'Wrong batch'}));
 await assertSucceeds(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:null}));await assertFails(deleteDoc(d(ao,'sparkLines/r~person1~2026-01-01')));
 await assertSucceeds(makeDraft(ao,'retry'));await assertSucceeds(add(ao,'person1~2026-01-01','retry'));await assertSucceeds(submit(ao,'retry'));
 await assertSucceeds(updateDoc(d(president,'sparkRemittances/retry'),{status:'declined',declinedBy:'president',declinedAt:serverTimestamp(),reason:'Not received'}));
 await assertSucceeds(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:null}));assert.equal((await getDoc(d(ao,'sparkLines/r~person1~2026-01-01'))).data().amountCents,25000);
 await assertSucceeds(makeDraft(ao,'accepted'));await assertSucceeds(add(ao,'person1~2026-01-01','accepted'));await assertSucceeds(submit(ao,'accepted'));await assertSucceeds(accept(president,'accepted'));
 await assertFails(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:null}));
});


test('roster records bind each cash payment to a registered member',async()=>{
 await setup();const ao=client('ao'),reviewer=client('reviewer');
 await assertFails(setDoc(d(reviewer,'sparkPeople/new'),{name:'Ana',createdAt:serverTimestamp(),createdBy:'reviewer'}));
 await assertFails(setDoc(d(ao,'sparkPeople/blank'),{name:'   ',createdAt:serverTimestamp(),createdBy:'ao'}));
 await assertSucceeds(setDoc(d(ao,'sparkPeople/new'),{name:'Ana',createdAt:serverTimestamp(),createdBy:'ao'}));
 await assertSucceeds(setDoc(d(ao,'sparkPeople/other'),{name:'Ana',createdAt:serverTimestamp(),createdBy:'ao'}));
 await assertFails(updateDoc(d(ao,'sparkPeople/new'),{name:'Someone else'}));
 await assertFails(makePayment(ao,'unknown~2026-01-01'));
 await assertFails(setDoc(d(ao,'sparkPayments/new~2026-01-01'),{personId:'new',memberName:'Forged name',absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:25000,createdAt:serverTimestamp(),createdBy:'ao',remittanceId:null}));
 await assertSucceeds(setDoc(d(ao,'sparkPayments/new~2026-01-01'),{personId:'new',memberName:'Ana',absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:25000,createdAt:serverTimestamp(),createdBy:'ao',remittanceId:null}));
});

test('expense time must not precede the latest accepted handover, go backwards, or be in the future',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));await assertSucceeds(accept(president));
 const ledger=(await getDoc(d(ao,'sparkLedger/current'))).data(),accepted=ledger.lastAcceptedAt;
 async function at(id,time,revision,balance){const b=writeBatch(ao);b.set(d(ao,'sparkExpenses/'+id),{amountCents:1000,description:'Supplies',occurredAt:time,createdAt:serverTimestamp(),createdBy:'ao'});b.update(d(ao,'sparkLedger/current'),{balanceCents:balance,revision,lastKind:'expense',lastId:id,lastExpenseAt:time});return b.commit();}
 await assertFails(at('before',new Date('2020-01-01'),2,24000));await assertFails(at('future',new Date('2099-01-01'),2,24000));
 await assertSucceeds(at('valid',accepted,2,24000));await assertFails(at('older',new Date('2020-01-01'),3,23000));
});


test('receipt confirmations are separate, accepted-only, collector-only and immutable',async()=>{
 await setup();const ao=client('ao'),president=client('president'),reviewer=client('reviewer');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));
 const member='sparkMemberReceipts/r~person1~2026-01-01',remit='sparkRemittanceReceipts/r';
 await assertFails(setDoc(d(ao,member),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'ao',printedAt:serverTimestamp()}));await assertFails(setDoc(d(ao,remit),{printedBy:'ao',printedAt:serverTimestamp()}));
 await assertSucceeds(accept(president));
 await assertFails(setDoc(d(reviewer,member),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'reviewer',printedAt:serverTimestamp()}));await assertFails(setDoc(d(ao,member),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'owner',printedAt:serverTimestamp()}));await assertFails(setDoc(d(ao,member),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'ao',printedAt:new Date('2020-01-01')}));
 await assertSucceeds(setDoc(d(ao,member),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'ao',printedAt:serverTimestamp()}));assert.equal((await getDoc(d(ao,remit))).exists(),false);
 await assertSucceeds(setDoc(d(ao,remit),{printedBy:'ao',printedAt:serverTimestamp()}));await assertFails(updateDoc(d(ao,member),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'owner'}));await assertFails(deleteDoc(d(ao,remit)));
});

test('receipt confirmation client retries do not update the original server timestamp',async()=>{
 await setup();const api=require('firebase/firestore'),{createProofClient}=require('./fixtures/faculty-spark-proof-client.cjs');const db=client('ao'),pres=client('president'),ao=createProofClient({db,api,orgId:'school',uid:'ao'});
 await assertSucceeds(makePayment(db));await assertSucceeds(makeDraft(db));await assertSucceeds(add(db,'person1~2026-01-01'));await assertSucceeds(submit(db));await assertSucceeds(accept(pres));
 assert.equal((await ao.confirmPrint('member','person1~2026-01-01','r')).replayed,false);const before=(await getDoc(d(db,'sparkMemberReceipts/r~person1~2026-01-01'))).data().printedAt;
 assert.equal((await ao.confirmPrint('member','person1~2026-01-01','r')).replayed,true);assert.ok(before.isEqual((await getDoc(d(db,'sparkMemberReceipts/r~person1~2026-01-01'))).data().printedAt));assert.equal((await ao.confirmPrint('remittance','r')).replayed,false);
});

async function requestCorrection(db,c='c',r='r'){
 const b=writeBatch(db);b.set(d(db,'sparkCorrections/'+c),{remittanceId:r,status:'pending',requestedBy:'ao',requestedAt:serverTimestamp(),reason:'Correction requested'});b.update(d(db,'sparkRemittances/'+r),{correctionId:c});return b.commit();
}
async function decideCorrection(db,c='c',r='r',decision='approve'){
 return runTransaction(db,async tx=>{
  const ledger=d(db,'sparkLedger/current'),snapshot=await tx.get(ledger),l=snapshot.data();
  if(decision==='decline'){
   tx.update(d(db,'sparkCorrections/'+c),{status:'declined',decidedBy:'president',decidedAt:serverTimestamp(),decisionReason:'Not correct'});tx.update(d(db,'sparkRemittances/'+r),{correctionId:null});
  }else{
   tx.update(d(db,'sparkCorrections/'+c),{status:'approved',decidedBy:'president',decidedAt:serverTimestamp()});tx.update(d(db,'sparkRemittances/'+r),{status:'voided',voidedBy:'president',voidedAt:serverTimestamp()});
   tx.update(ledger,{balanceCents:l.balanceCents-25000,revision:l.revision+1,lastKind:'correction',lastId:r});
  }
 });
}

test('correction requires two people and preserves old history and separate receipt status',async()=>{
 await setup();const ao=client('ao'),president=client('president'),reviewer=client('reviewer');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));await assertSucceeds(accept(president));
 await assertSucceeds(setDoc(d(ao,'sparkMemberReceipts/r~person1~2026-01-01'),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'ao',printedAt:serverTimestamp()}));
 await assertFails(setDoc(d(ao,'sparkCorrections/no-pair'),{remittanceId:'r',status:'pending',requestedBy:'ao',requestedAt:serverTimestamp(),reason:'Problem'}));
 await assertSucceeds(requestCorrection(ao));await assertFails(setDoc(d(ao,'sparkRemittanceReceipts/r'),{printedBy:'ao',printedAt:serverTimestamp()}));
 await assertFails(decideCorrection(ao));await assertFails(decideCorrection(reviewer));await assertSucceeds(decideCorrection(president,'c','r','decline'));
 assert.equal((await getDoc(d(ao,'sparkCorrections/c'))).data().status,'declined');await assertSucceeds(requestCorrection(ao,'c2'));await assertSucceeds(decideCorrection(president,'c2'));
 const old=(await getDoc(d(ao,'sparkRemittances/r'))).data();assert.equal(old.status,'voided');assert.equal(old.acceptedBy,'president');assert.ok(old.acceptedAt);assert.equal((await getDoc(d(ao,'sparkLedger/current'))).data().balanceCents,0);
 await assertFails(deleteDoc(d(ao,'sparkCorrections/c2')));await assertSucceeds(updateDoc(d(ao,'sparkPayments/person1~2026-01-01'),{remittanceId:null}));
 await assertSucceeds(makeDraft(ao,'new'));await assertSucceeds(add(ao,'person1~2026-01-01','new'));await assertSucceeds(submit(ao,'new'));await assertSucceeds(accept(president,'new',25000,3));
 await assertSucceeds(setDoc(d(ao,'sparkMemberReceipts/new~person1~2026-01-01'),{paymentId:'person1~2026-01-01',remittanceId:'new',printedBy:'ao',printedAt:serverTimestamp()}));
 assert.equal((await getDoc(d(ao,'sparkMemberReceipts/r~person1~2026-01-01'))).exists(),true);
});

test('correction cannot remove an acceptance after an expense, even when remaining cash is sufficient',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertSucceeds(makePayment(ao,'person2~2026-01-02',30000));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));await assertSucceeds(accept(president));
 await assertSucceeds(makeDraft(ao,'r2'));await assertSucceeds(add(ao,'person2~2026-01-02','r2',30000));await assertSucceeds(submit(ao,'r2'));await assertSucceeds(accept(president,'r2',55000,2));
 await assertSucceeds(spend(ao,'exp',10000));await assertSucceeds(requestCorrection(ao));await assertFails(decideCorrection(president));
 assert.equal((await getDoc(d(ao,'sparkLedger/current'))).data().balanceCents,45000);assert.equal((await getDoc(d(ao,'sparkRemittances/r'))).data().status,'accepted');
});


test('cannot confirm receipt in the same batch that creates a correction request',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));await assertSucceeds(accept(president));
 const b=writeBatch(ao);b.set(d(ao,'sparkCorrections/c'),{remittanceId:'r',status:'pending',requestedBy:'ao',requestedAt:serverTimestamp(),reason:'Correction'});b.update(d(ao,'sparkRemittances/r'),{correctionId:'c'});b.set(d(ao,'sparkMemberReceipts/r~person1~2026-01-01'),{paymentId:'person1~2026-01-01',remittanceId:'r',printedBy:'ao',printedAt:serverTimestamp()});await assertFails(b.commit());
});

test('prototype client resumes cancelled batches and correction decisions without duplication',async()=>{
 await setup();const api=require('firebase/firestore'),{createProofClient}=require('./fixtures/faculty-spark-proof-client.cjs');const db=client('ao'),ao=createProofClient({db,api,orgId:'school',uid:'ao'}),president=createProofClient({db:client('president'),api,orgId:'school',uid:'president'});
 assert.equal((await ao.createPerson('newperson','Ana')).replayed,false);assert.equal((await ao.createPerson('newperson','Ana')).replayed,true);await assert.rejects(ao.createPerson('newperson','Other'));
 const p=await ao.payment({personId:'newperson',absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:25000});await ao.draft('cancelled');await ao.add('cancelled',p.paymentId);await ao.cancel('cancelled','Wrong batch');assert.equal((await ao.cancel('cancelled','Wrong batch')).replayed,true);await ao.release('cancelled',p.paymentId);assert.equal((await ao.release('cancelled',p.paymentId)).replayed,true);
 await ao.draft('accepted');await ao.add('accepted',p.paymentId);await ao.submit('accepted');await president.accept('accepted');await ao.requestCorrection('fix','accepted','Wrong amount');assert.equal((await ao.requestCorrection('fix','accepted','Wrong amount')).replayed,true);
 await assert.rejects(ao.decideCorrection('fix','approved'));await president.decideCorrection('fix','approved');assert.equal((await president.decideCorrection('fix','approved')).replayed,true);await ao.release('accepted',p.paymentId);assert.equal((await getDoc(d(db,'sparkLedger/current'))).data().balanceCents,0);
});

test('simultaneous spending and correction approval cannot both commit',async()=>{
 await setup();const ao=client('ao'),president=client('president');await assertSucceeds(makePayment(ao));await assertSucceeds(makeDraft(ao));await assertSucceeds(add(ao,'person1~2026-01-01'));await assertSucceeds(submit(ao));await assertSucceeds(accept(president));await assertSucceeds(requestCorrection(ao));
 const results=await Promise.allSettled([spend(ao,'race',20000),decideCorrection(president)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const balance=(await getDoc(d(ao,'sparkLedger/current'))).data().balanceCents,rem=(await getDoc(d(ao,'sparkRemittances/r'))).data();assert.ok((balance===0&&rem.status==='voided')||(balance===5000&&rem.status==='accepted'));
});
