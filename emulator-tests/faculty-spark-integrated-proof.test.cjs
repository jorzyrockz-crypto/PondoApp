'use strict';
// Integrated Firestore-only experiment. Never loads or modifies live data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,writeBatch,runTransaction,serverTimestamp}=require('firebase/firestore');
const PROJECT='demo-pondo-security',root='organizations/school';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback emulator first');
let env;
test.before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-integrated-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['reviewer','reviewer']])await setDoc(doc(db,`${root}/members/${uid}`),{uid,role});for(const id of ['person1','person2'])await setDoc(doc(db,`${root}/sparkPeople/${id}`),{name:id,createdBy:'ao',createdAt:new Date('2025-01-01')});});});
test.after(async()=>{if(env)await env.cleanup()});
const client=uid=>env.authenticatedContext(uid).firestore();const d=(db,p)=>doc(db,`${root}/${p}`);
async function setup(){await setDoc(d(client('owner'),'sparkConfig/current'),{presidentUid:'president',assignedAt:serverTimestamp(),assignedBy:'owner'});}
async function pending(db,r,p,amount=25000){
 await setDoc(d(db,'sparkPayments/'+p+'~2026-01-01'),{personId:p,memberName:p,absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:amount,createdAt:serverTimestamp(),createdBy:'ao',remittanceId:null});
 await setDoc(d(db,'sparkRemittances/'+r),{status:'draft',amountCents:0,count:0,lastPaymentId:null,correctionId:null,createdBy:'ao',createdAt:serverTimestamp()});const id=p+'~2026-01-01',b=writeBatch(db);
 b.update(d(db,'sparkPayments/'+id),{remittanceId:r});b.set(d(db,'sparkLines/'+r+'~'+id),{remittanceId:r,paymentId:id,amountCents:amount,linkedAt:serverTimestamp(),linkedBy:'ao'});b.update(d(db,'sparkRemittances/'+r),{amountCents:amount,count:1,lastPaymentId:id});await b.commit();await updateDoc(d(db,'sparkRemittances/'+r),{status:'pending',presidentUid:'president',submittedAt:serverTimestamp()});
}
async function accept(db,r,amount=25000){const b=writeBatch(db);b.update(d(db,'sparkRemittances/'+r),{status:'accepted',acceptedBy:'president',acceptedAt:serverTimestamp()});b.set(d(db,'sparkWallets/'+r),{status:'open',amountCents:amount,unspentCents:amount,acceptedAt:serverTimestamp(),revision:0,lastAllocation:null});return b.commit();}
async function expense(db,id,amount,occurredAt){return setDoc(d(db,'sparkExpenseDrafts/'+id),{status:'draft',amountCents:amount,allocatedCents:0,count:0,lastAllocation:null,description:'School supplies',payee:'Supplier',occurredAt,createdAt:serverTimestamp(),createdBy:'ao'});}
async function allocate(db,expenseId,walletId,id,amount){return runTransaction(db,async tx=>{const w=d(db,'sparkWallets/'+walletId),e=d(db,'sparkExpenseDrafts/'+expenseId),[ws,es]=await Promise.all([tx.get(w),tx.get(e)]),wallet=ws.data(),draft=es.data();tx.set(d(db,'sparkAllocations/'+id),{expenseId,walletId,amountCents:amount,recordedAt:serverTimestamp(),recordedBy:'ao'});tx.update(w,{unspentCents:wallet.unspentCents-amount,revision:wallet.revision+1,lastAllocation:id});tx.update(e,{allocatedCents:draft.allocatedCents+amount,count:draft.count+1,lastAllocation:id});});}
async function finalize(db,id){return updateDoc(d(db,'sparkExpenseDrafts/'+id),{status:'recorded',recordedAt:serverTimestamp()});}
async function requestCorrection(db,r,c){const b=writeBatch(db);b.set(d(db,'sparkCorrections/'+c),{remittanceId:r,status:'pending',requestedBy:'ao',requestedAt:serverTimestamp(),reason:'Incorrect handover'});b.update(d(db,'sparkRemittances/'+r),{correctionId:c});return b.commit();}
async function approveCorrection(db,r,c){const b=writeBatch(db);b.update(d(db,'sparkCorrections/'+c),{status:'approved',decidedBy:'president',decidedAt:serverTimestamp()});b.update(d(db,'sparkRemittances/'+r),{status:'voided',voidedBy:'president',voidedAt:serverTimestamp()});b.update(d(db,'sparkWallets/'+r),{status:'voided'});return b.commit();}

test('only the President can create a wallet tied to the exact accepted amount and server timestamp',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'r','person1');
 await assertFails(setDoc(d(ao,'sparkWallets/r'),{status:'open',amountCents:25000,unspentCents:25000,acceptedAt:serverTimestamp(),revision:0,lastAllocation:null}));
 await assertFails(updateDoc(d(pres,'sparkRemittances/r'),{status:'accepted',acceptedBy:'president',acceptedAt:serverTimestamp()}));
 await assertFails(accept(pres,'r',25001));await assertFails(accept(ao,'r'));await assertSucceeds(accept(pres,'r'));const w=(await getDoc(d(ao,'sparkWallets/r'))).data();assert.equal(w.unspentCents,25000);assert.ok(w.acceptedAt.isEqual((await getDoc(d(ao,'sparkRemittances/r'))).data().acceptedAt));
});

test('historical expenses can use earlier wallets but not funds accepted later',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'early','person1');await accept(pres,'early');const at=(await getDoc(d(ao,'sparkWallets/early'))).data().acceptedAt;
 await pending(ao,'late','person2');await accept(pres,'late');await assertSucceeds(expense(ao,'old',15000,at));await assertFails(allocate(ao,'old','late','wrong',1000));
 await assertSucceeds(allocate(ao,'old','early','correct',15000));await assertSucceeds(finalize(ao,'old'));assert.equal((await getDoc(d(ao,'sparkWallets/early'))).data().unspentCents,10000);assert.equal((await getDoc(d(ao,'sparkWallets/late'))).data().unspentCents,25000);
});

test('a grouped expense must be fully allocated, atomically and without overdraw',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'one','person1');await accept(pres,'one');await pending(ao,'two','person2');await accept(pres,'two');const at=(await getDoc(d(ao,'sparkWallets/two'))).data().acceptedAt;
 await assertSucceeds(expense(ao,'large',40000,at));await assertFails(finalize(ao,'large'));await assertFails(allocate(ao,'large','one','excess',26000));
 await assertSucceeds(allocate(ao,'large','one','part1',25000));await assertFails(finalize(ao,'large'));await assertSucceeds(allocate(ao,'large','two','part2',15000));await assertSucceeds(finalize(ao,'large'));
 assert.equal((await getDoc(d(ao,'sparkWallets/one'))).data().unspentCents,0);assert.equal((await getDoc(d(ao,'sparkWallets/two'))).data().unspentCents,10000);assert.equal((await getDoc(d(ao,'sparkExpenseDrafts/large'))).data().allocatedCents,40000);
 await assertFails(updateDoc(d(ao,'sparkExpenseDrafts/large'),{amountCents:1}));await assertFails(updateDoc(d(ao,'sparkAllocations/part1'),{amountCents:1}));
});

test('competing expenses and forged multi-line allocations cannot consume the same wallet twice',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'r','person1');await accept(pres,'r');const at=(await getDoc(d(ao,'sparkWallets/r'))).data().acceptedAt;
 await expense(ao,'e1',20000,at);await expense(ao,'e2',20000,at);const results=await Promise.allSettled([allocate(ao,'e1','r','a1',20000),allocate(ao,'e2','r','a2',20000)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await getDoc(d(ao,'sparkWallets/r'))).data().unspentCents,5000);
 const b=writeBatch(ao);b.set(d(ao,'sparkAllocations/fake'),{expenseId:'e1',walletId:'r',amountCents:1000,recordedAt:serverTimestamp(),recordedBy:'ao'});await assertFails(b.commit());
});

test('corrections preserve historical funds and freeze allocations while pending',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'used','person1');await accept(pres,'used');await pending(ao,'unused','person2');await accept(pres,'unused');const at=(await getDoc(d(ao,'sparkWallets/unused'))).data().acceptedAt;
 await expense(ao,'e',10000,at);await allocate(ao,'e','used','a',10000);await finalize(ao,'e');await requestCorrection(ao,'used','c1');await assertFails(approveCorrection(pres,'used','c1'));
 await requestCorrection(ao,'unused','c2');await expense(ao,'e2',1000,at);await assertFails(allocate(ao,'e2','unused','a2',1000));await assertFails(approveCorrection(ao,'unused','c2'));await assertSucceeds(approveCorrection(pres,'unused','c2'));
 assert.equal((await getDoc(d(ao,'sparkWallets/unused'))).data().status,'voided');assert.equal((await getDoc(d(ao,'sparkRemittances/unused'))).data().status,'voided');assert.equal((await getDoc(d(ao,'sparkWallets/used'))).data().unspentCents,15000);
});
