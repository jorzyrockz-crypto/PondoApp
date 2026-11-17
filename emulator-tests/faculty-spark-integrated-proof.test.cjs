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
 const id='pay_'+p,slotId=p+'~2026-01-01',create=writeBatch(db);create.set(d(db,'sparkPayments/'+id),{slotId,personId:p,memberName:p,absenceDate:'2026-01-01',paymentDate:'2026-01-02',amountCents:amount,createdAt:serverTimestamp(),createdBy:'ao',remittanceId:null,voidedAt:null,voidedBy:null,voidReason:null});create.set(d(db,'sparkPaymentSlots/'+slotId),{personId:p,absenceDate:'2026-01-01',activePaymentId:id,revision:1});await create.commit();
 await setDoc(d(db,'sparkRemittances/'+r),{status:'draft',amountCents:0,count:0,lastPaymentId:null,correctionId:null,createdBy:'ao',createdAt:serverTimestamp()});const b=writeBatch(db);
 b.update(d(db,'sparkPayments/'+id),{remittanceId:r});b.set(d(db,'sparkLines/'+r+'~'+id),{remittanceId:r,paymentId:id,amountCents:amount,linkedAt:serverTimestamp(),linkedBy:'ao'});b.update(d(db,'sparkRemittances/'+r),{amountCents:amount,count:1,lastPaymentId:id});await b.commit();await updateDoc(d(db,'sparkRemittances/'+r),{status:'pending',presidentUid:'president',submittedAt:serverTimestamp()});
}
async function accept(db,r,amount=25000){const b=writeBatch(db);b.update(d(db,'sparkRemittances/'+r),{status:'accepted',acceptedBy:'president',acceptedAt:serverTimestamp()});b.set(d(db,'sparkWallets/'+r),{status:'open',amountCents:amount,unspentCents:amount,acceptedAt:serverTimestamp(),revision:0,lastAllocation:null,lastRelease:null});return b.commit();}
async function expense(db,id,amount,occurredAt){return setDoc(d(db,'sparkExpenseDrafts/'+id),{status:'draft',amountCents:amount,allocatedCents:0,count:0,lastAllocation:null,lastRelease:null,description:'School supplies',payee:'Supplier',occurredAt,createdAt:serverTimestamp(),createdBy:'ao'});}
async function allocate(db,expenseId,walletId,id,amount){return runTransaction(db,async tx=>{const w=d(db,'sparkWallets/'+walletId),e=d(db,'sparkExpenseDrafts/'+expenseId),[ws,es]=await Promise.all([tx.get(w),tx.get(e)]),wallet=ws.data(),draft=es.data();tx.set(d(db,'sparkAllocations/'+id),{expenseId,walletId,amountCents:amount,recordedAt:serverTimestamp(),recordedBy:'ao',releasedAt:null,releasedBy:null});tx.update(w,{unspentCents:wallet.unspentCents-amount,revision:wallet.revision+1,lastAllocation:id});tx.update(e,{allocatedCents:draft.allocatedCents+amount,count:draft.count+1,lastAllocation:id});});}
async function finalize(db,id){return updateDoc(d(db,'sparkExpenseDrafts/'+id),{status:'recorded',recordedAt:serverTimestamp()});}
async function requestCorrection(db,r,c){const b=writeBatch(db);b.set(d(db,'sparkCorrections/'+c),{remittanceId:r,status:'pending',requestedBy:'ao',requestedAt:serverTimestamp(),reason:'Incorrect handover'});b.update(d(db,'sparkRemittances/'+r),{correctionId:c});return b.commit();}
async function approveCorrection(db,r,c){const b=writeBatch(db);b.update(d(db,'sparkCorrections/'+c),{status:'approved',decidedBy:'president',decidedAt:serverTimestamp()});b.update(d(db,'sparkRemittances/'+r),{status:'voided',voidedBy:'president',voidedAt:serverTimestamp()});b.update(d(db,'sparkWallets/'+r),{status:'voided'});return b.commit();}

test('only the President can create a wallet tied to the exact accepted amount and server timestamp',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'r','person1');
 await assertFails(setDoc(d(ao,'sparkWallets/r'),{status:'open',amountCents:25000,unspentCents:25000,acceptedAt:serverTimestamp(),revision:0,lastAllocation:null,lastRelease:null}));
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
 const b=writeBatch(ao);b.set(d(ao,'sparkAllocations/fake'),{expenseId:'e1',walletId:'r',amountCents:1000,recordedAt:serverTimestamp(),recordedBy:'ao',releasedAt:null,releasedBy:null});await assertFails(b.commit());
});

test('corrections preserve historical funds and freeze allocations while pending',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'used','person1');await accept(pres,'used');await pending(ao,'unused','person2');await accept(pres,'unused');const at=(await getDoc(d(ao,'sparkWallets/unused'))).data().acceptedAt;
 await expense(ao,'e',10000,at);await allocate(ao,'e','used','a',10000);await finalize(ao,'e');await requestCorrection(ao,'used','c1');await assertFails(approveCorrection(pres,'used','c1'));
 await requestCorrection(ao,'unused','c2');await expense(ao,'e2',1000,at);await assertFails(allocate(ao,'e2','unused','a2',1000));await assertFails(approveCorrection(ao,'unused','c2'));await assertSucceeds(approveCorrection(pres,'unused','c2'));
 assert.equal((await getDoc(d(ao,'sparkWallets/unused'))).data().status,'voided');assert.equal((await getDoc(d(ao,'sparkRemittances/unused'))).data().status,'voided');assert.equal((await getDoc(d(ao,'sparkWallets/used'))).data().unspentCents,15000);
});

async function beginCancel(db,e){return updateDoc(d(db,'sparkExpenseDrafts/'+e),{status:'cancelling',cancelReason:'Wrong amount',cancelRequestedBy:'ao',cancelRequestedAt:serverTimestamp()});}
async function releaseAllocation(db,id){return runTransaction(db,async tx=>{
 const a=d(db,'sparkAllocations/'+id),as=await tx.get(a),line=as.data(),e=d(db,'sparkExpenseDrafts/'+line.expenseId),w=d(db,'sparkWallets/'+line.walletId),[es,ws]=await Promise.all([tx.get(e),tx.get(w)]),draft=es.data(),wallet=ws.data();
 tx.update(a,{releasedAt:serverTimestamp(),releasedBy:'ao'});tx.update(e,{allocatedCents:draft.allocatedCents-line.amountCents,count:draft.count-1,lastRelease:id});tx.update(w,{unspentCents:wallet.unspentCents+line.amountCents,revision:wallet.revision+1,lastRelease:id});
});}
async function finishCancel(db,e){return updateDoc(d(db,'sparkExpenseDrafts/'+e),{status:'cancelled',cancelledAt:serverTimestamp()});}

test('cancelled partial expense releases each reservation once and preserves its history',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'one','person1');await accept(pres,'one');await pending(ao,'two','person2');await accept(pres,'two');const at=(await getDoc(d(ao,'sparkWallets/two'))).data().acceptedAt;
 await expense(ao,'e',45000,at);await allocate(ao,'e','one','a1',25000);await allocate(ao,'e','two','a2',10000);await assertFails(releaseAllocation(ao,'a1'));await assertSucceeds(beginCancel(ao,'e'));await assertFails(finalize(ao,'e'));await assertFails(finishCancel(ao,'e'));
 await assertSucceeds(releaseAllocation(ao,'a1'));await assertFails(releaseAllocation(ao,'a1'));await assertSucceeds(releaseAllocation(ao,'a2'));await assertSucceeds(finishCancel(ao,'e'));
 assert.equal((await getDoc(d(ao,'sparkWallets/one'))).data().unspentCents,25000);assert.equal((await getDoc(d(ao,'sparkWallets/two'))).data().unspentCents,25000);
 const old=(await getDoc(d(ao,'sparkAllocations/a1'))).data();assert.equal(old.amountCents,25000);assert.equal(old.releasedBy,'ao');assert.ok(old.releasedAt);assert.equal((await getDoc(d(ao,'sparkExpenseDrafts/e'))).data().status,'cancelled');
});

test('a release cannot increase a wallet without matching cancellation and allocation updates',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'r','person1');await accept(pres,'r');const at=(await getDoc(d(ao,'sparkWallets/r'))).data().acceptedAt;await expense(ao,'e',10000,at);await allocate(ao,'e','r','a',10000);await beginCancel(ao,'e');
 await assertFails(updateDoc(d(ao,'sparkWallets/r'),{unspentCents:25000,revision:2,lastRelease:'a'}));await assertFails(updateDoc(d(ao,'sparkAllocations/a'),{releasedAt:serverTimestamp(),releasedBy:'ao'}));await assertSucceeds(releaseAllocation(ao,'a'));
});

test('integrated client can retry lost responses without duplicate acceptance, expense or release',async()=>{
 await setup();const api=require('firebase/firestore'),{createIntegratedClient}=require('./fixtures/faculty-spark-integrated-client.cjs'),aoDb=client('ao'),pDb=client('president'),ao=createIntegratedClient({db:aoDb,api,orgId:'school',uid:'ao'}),pres=createIntegratedClient({db:pDb,api,orgId:'school',uid:'president'});
 await pending(aoDb,'r','person1');assert.equal((await pres.accept('r')).replayed,false);assert.equal((await pres.accept('r')).replayed,true);const occurredAt=(await getDoc(d(aoDb,'sparkWallets/r'))).data().acceptedAt;
 const values={amountCents:20000,description:'School supplies',payee:'Supplier',occurredAt};assert.equal((await ao.createExpense('expense1',values)).replayed,false);assert.equal((await ao.createExpense('expense1',values)).replayed,true);await assert.rejects(ao.createExpense('expense1',{...values,amountCents:10000}));
 assert.equal((await ao.allocate('expense1','r','alloc1',10000)).replayed,false);assert.equal((await ao.allocate('expense1','r','alloc1',10000)).replayed,true);await assert.rejects(ao.allocate('expense1','r','alloc1',9000));
 await ao.cancelExpense('expense1','Wrong amount');assert.equal((await ao.cancelExpense('expense1','Wrong amount')).replayed,true);await ao.release('alloc1');assert.equal((await ao.release('alloc1')).replayed,true);await ao.finishCancellation('expense1');assert.equal((await ao.finishCancellation('expense1')).replayed,true);assert.equal((await getDoc(d(aoDb,'sparkWallets/r'))).data().unspentCents,25000);
});

test('integrated client completes multi-wallet expense and retries each allocation safely',async()=>{
 await setup();const api=require('firebase/firestore'),{createIntegratedClient}=require('./fixtures/faculty-spark-integrated-client.cjs'),db=client('ao'),p=client('president'),ao=createIntegratedClient({db,api,orgId:'school',uid:'ao'}),pres=createIntegratedClient({db:p,api,orgId:'school',uid:'president'});
 await pending(db,'one','person1');await pres.accept('one');await pending(db,'two','person2');await pres.accept('two');const occurredAt=(await getDoc(d(db,'sparkWallets/two'))).data().acceptedAt;
 await ao.createExpense('expense',{amountCents:40000,description:'Materials',payee:'Supplier',occurredAt});await ao.allocate('expense','one','partone',25000);await assert.rejects(ao.finalizeExpense('expense'));await ao.allocate('expense','two','parttwo',15000);assert.equal((await ao.allocate('expense','two','parttwo',15000)).replayed,true);await ao.finalizeExpense('expense');assert.equal((await ao.finalizeExpense('expense')).replayed,true);
 assert.equal((await getDoc(d(db,'sparkWallets/one'))).data().unspentCents,0);assert.equal((await getDoc(d(db,'sparkWallets/two'))).data().unspentCents,10000);
});

test('cannot fund an expense while atomically requesting correction of its handover',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'r','person1');await accept(pres,'r');const at=(await getDoc(d(ao,'sparkWallets/r'))).data().acceptedAt;await expense(ao,'e',10000,at);
 const b=writeBatch(ao);b.set(d(ao,'sparkCorrections/c'),{remittanceId:'r',status:'pending',requestedBy:'ao',requestedAt:serverTimestamp(),reason:'Review'});b.update(d(ao,'sparkRemittances/r'),{correctionId:'c'});
 b.set(d(ao,'sparkAllocations/a'),{expenseId:'e',walletId:'r',amountCents:10000,recordedAt:serverTimestamp(),recordedBy:'ao',releasedAt:null,releasedBy:null});b.update(d(ao,'sparkWallets/r'),{unspentCents:15000,revision:1,lastAllocation:'a'});b.update(d(ao,'sparkExpenseDrafts/e'),{allocatedCents:10000,count:1,lastAllocation:'a'});await assertFails(b.commit());
});

test('a single expense increment cannot conceal allocations from two accepted wallets',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'one','person1');await accept(pres,'one');await pending(ao,'two','person2');await accept(pres,'two');const at=(await getDoc(d(ao,'sparkWallets/two'))).data().acceptedAt;await expense(ao,'e',20000,at);
 const b=writeBatch(ao);for(const [id,w] of [['a1','one'],['a2','two']]){b.set(d(ao,'sparkAllocations/'+id),{expenseId:'e',walletId:w,amountCents:10000,recordedAt:serverTimestamp(),recordedBy:'ao',releasedAt:null,releasedBy:null});b.update(d(ao,'sparkWallets/'+w),{unspentCents:15000,revision:1,lastAllocation:id});}b.update(d(ao,'sparkExpenseDrafts/e'),{allocatedCents:10000,count:1,lastAllocation:'a1'});await assertFails(b.commit());
 assert.equal((await getDoc(d(ao,'sparkWallets/one'))).data().unspentCents,25000);assert.equal((await getDoc(d(ao,'sparkWallets/two'))).data().unspentCents,25000);
});

test('a fully released draft can be corrected, but a recorded expense cannot be cancelled as a draft',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'one','person1');await accept(pres,'one');await pending(ao,'two','person2');await accept(pres,'two');const at=(await getDoc(d(ao,'sparkWallets/two'))).data().acceptedAt;
 await expense(ao,'recorded',5000,at);await allocate(ao,'recorded','one','a',5000);await finalize(ao,'recorded');await assertFails(beginCancel(ao,'recorded'));
 await expense(ao,'draft',5000,at);await allocate(ao,'draft','two','b',5000);await beginCancel(ao,'draft');await releaseAllocation(ao,'b');await finishCancel(ao,'draft');await requestCorrection(ao,'two','fix');await assertSucceeds(approveCorrection(pres,'two','fix'));
 assert.equal((await getDoc(d(ao,'sparkWallets/one'))).data().unspentCents,20000);assert.equal((await getDoc(d(ao,'sparkWallets/two'))).data().status,'voided');
});

test('voiding a recorded expense requires a reason and releases each allocation exactly once',async()=>{
 await setup();const api=require('firebase/firestore'),{createIntegratedClient}=require('./fixtures/faculty-spark-integrated-client.cjs'),db=client('ao'),p=client('president'),ao=createIntegratedClient({db,api,orgId:'school',uid:'ao'}),reviewer=createIntegratedClient({db:client('reviewer'),api,orgId:'school',uid:'reviewer'}),pres=createIntegratedClient({db:p,api,orgId:'school',uid:'president'});
 await pending(db,'one','person1');await pres.accept('one');await pending(db,'two','person2');await pres.accept('two');const occurredAt=(await getDoc(d(db,'sparkWallets/two'))).data().acceptedAt;
 await ao.createExpense('e',{amountCents:40000,description:'Materials',payee:'Supplier',occurredAt});await ao.allocate('e','one','a',25000);await ao.allocate('e','two','b',15000);await ao.finalizeExpense('e');
 await assert.rejects(ao.beginVoid('e',''));await assert.rejects(reviewer.beginVoid('e','Wrong receipt'));await ao.beginVoid('e','Wrong receipt');assert.equal((await ao.beginVoid('e','Wrong receipt')).replayed,true);
 await assert.rejects(ao.finishVoid('e'));await ao.release('a');assert.equal((await ao.release('a')).replayed,true);await assert.rejects(ao.finishVoid('e'));await ao.release('b');await ao.finishVoid('e');assert.equal((await ao.finishVoid('e')).replayed,true);
 const history=(await getDoc(d(db,'sparkExpenseDrafts/e'))).data();assert.equal(history.status,'voided');assert.equal(history.amountCents,40000);assert.equal(history.voidReason,'Wrong receipt');assert.ok(history.recordedAt);assert.ok(history.voidRequestedAt);assert.ok(history.voidedAt);assert.equal(history.allocatedCents,0);
 assert.equal((await getDoc(d(db,'sparkWallets/one'))).data().unspentCents,25000);assert.equal((await getDoc(d(db,'sparkWallets/two'))).data().unspentCents,25000);assert.ok((await getDoc(d(db,'sparkAllocations/a'))).data().releasedAt);
});

test('no actor can forge a partial void or refund an allocation twice',async()=>{
 await setup();const ao=client('ao'),pres=client('president');await pending(ao,'r','person1');await accept(pres,'r');const at=(await getDoc(d(ao,'sparkWallets/r'))).data().acceptedAt;await expense(ao,'e',10000,at);await allocate(ao,'e','r','a',10000);await finalize(ao,'e');
 await assertFails(updateDoc(d(ao,'sparkExpenseDrafts/e'),{status:'voided',voidedAt:serverTimestamp()}));await assertFails(updateDoc(d(ao,'sparkExpenseDrafts/e'),{status:'voiding',voidReason:'',voidRequestedBy:'ao',voidRequestedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(d(ao,'sparkExpenseDrafts/e'),{status:'voiding',voidReason:'Incorrect entry',voidRequestedBy:'ao',voidRequestedAt:serverTimestamp()}));await assertFails(updateDoc(d(ao,'sparkExpenseDrafts/e'),{status:'voided',voidedAt:serverTimestamp()}));await assertFails(updateDoc(d(ao,'sparkWallets/r'),{unspentCents:25000,revision:2,lastRelease:'a'}));await assertSucceeds(releaseAllocation(ao,'a'));await assertFails(releaseAllocation(ao,'a'));await assertSucceeds(updateDoc(d(ao,'sparkExpenseDrafts/e'),{status:'voided',voidedAt:serverTimestamp()}));
});

test('a second client can inspect and finish an interrupted expense reversal',async()=>{
 await setup();const api=require('firebase/firestore'),{createIntegratedClient}=require('./fixtures/faculty-spark-integrated-client.cjs'),db=client('ao'),pres=createIntegratedClient({db:client('president'),api,orgId:'school',uid:'president'}),ao=createIntegratedClient({db,api,orgId:'school',uid:'ao'});
 await pending(db,'one','person1');await pres.accept('one');await pending(db,'two','person2');await pres.accept('two');const at=(await getDoc(d(db,'sparkWallets/two'))).data().acceptedAt;
 await ao.createExpense('resume',{amountCents:40000,description:'Supplies',payee:'Supplier',occurredAt:at});await ao.allocate('resume','one','line1',25000);await ao.allocate('resume','two','line2',15000);await ao.finalizeExpense('resume');await ao.beginVoid('resume','Incorrect');await ao.release('line1');
 const resumed=createIntegratedClient({db:client('ao'),api,orgId:'school',uid:'ao'}),view=await resumed.inspectExpense('resume');assert.equal(view.status,'voiding');assert.equal(view.allocatedCents,15000);assert.deepEqual(view.allocations.map(x=>[x.id,x.released]),[['line1',true],['line2',false]]);
 await resumed.release('line2');await resumed.finishVoid('resume');const final=await resumed.inspectExpense('resume');assert.equal(final.status,'voided');assert.equal(final.allocatedCents,0);assert.equal(final.allocations.filter(x=>x.released).length,2);
});

test('expense recovery refuses inconsistent allocation data instead of guessing',async()=>{
 await setup();const api=require('firebase/firestore'),{createIntegratedClient}=require('./fixtures/faculty-spark-integrated-client.cjs'),db=client('ao'),pres=client('president'),ao=createIntegratedClient({db,api,orgId:'school',uid:'ao'});await pending(db,'r','person1');await accept(pres,'r');const at=(await getDoc(d(db,'sparkWallets/r'))).data().acceptedAt;await ao.createExpense('e',{amountCents:10000,description:'Supplies',payee:'Supplier',occurredAt:at});await ao.allocate('e','r','a',10000);
 await env.withSecurityRulesDisabled(async c=>updateDoc(d(c.firestore(),'sparkExpenseDrafts/e'),{allocatedCents:9999}));await assert.rejects(ao.inspectExpense('e'),/inconsistent/);
});
