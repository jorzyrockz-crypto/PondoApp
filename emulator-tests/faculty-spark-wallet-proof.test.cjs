'use strict';
// Separate test environment: proof for historical expense allocation only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,writeBatch,runTransaction,serverTimestamp,Timestamp}=require('firebase/firestore');
const PROJECT='demo-pondo-security',root='organizations/school';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback Firestore emulator first');
let env;
test.before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-wallet-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [uid,role] of [['ao','disbursing'],['reviewer','reviewer']])await setDoc(doc(db,`${root}/members/${uid}`),{uid,role});for(const [id,date] of [['early','2026-01-01T01:00:00Z'],['late','2026-01-03T01:00:00Z']])await setDoc(doc(db,`${root}/walletProof/${id}`),{acceptedAt:Timestamp.fromDate(new Date(date)),unspentCents:25000,revision:0,lastAllocation:''});});});
test.after(async()=>{if(env)await env.cleanup()});
const client=uid=>env.authenticatedContext(uid).firestore();const d=(db,p)=>doc(db,`${root}/${p}`);
async function spend(db,id,walletId,amount,occurredAt,group='expense'){
 return runTransaction(db,async tx=>{const wallet=d(db,'walletProof/'+walletId),snap=await tx.get(wallet),old=snap.data();tx.set(d(db,'allocationProof/'+id),{walletId,expenseGroup:group,amountCents:amount,occurredAt:new Date(occurredAt),recordedAt:serverTimestamp(),recordedBy:'ao'});tx.update(wallet,{unspentCents:old.unspentCents-amount,revision:old.revision+1,lastAllocation:id});});
}

test('late-entered and out-of-order expenses use only remittances already accepted at the expense time',async()=>{
 const ao=client('ao');await assertSucceeds(spend(ao,'middle','early',5000,'2026-01-02T01:00:00Z'));await assertSucceeds(spend(ao,'earlier','early',5000,'2026-01-01T02:00:00Z'));
 await assertFails(spend(ao,'too-early','late',1000,'2026-01-02T01:00:00Z'));await assertSucceeds(spend(ao,'after-late','late',1000,'2026-01-04T01:00:00Z'));
 assert.equal((await getDoc(d(ao,'walletProof/early'))).data().unspentCents,15000);assert.equal((await getDoc(d(ao,'walletProof/late'))).data().unspentCents,24000);
});
test('unauthorized users, altered dates, and unpaired balance changes fail',async()=>{
 const ao=client('ao'),reviewer=client('reviewer');await assertFails(spend(reviewer,'bad','early',1000,'2026-01-02T01:00:00Z'));
 await assertFails(spend(ao,'future','early',1000,'2099-01-02T01:00:00Z'));await assertFails(updateDoc(d(ao,'walletProof/early'),{unspentCents:100000,revision:1,lastAllocation:'fake'}));
 await assertSucceeds(spend(ao,'actual','early',1000,'2026-01-02T01:00:00Z'));await assertFails(updateDoc(d(ao,'allocationProof/actual'),{occurredAt:new Date('2025-01-01')}));
});
test('concurrent allocations cannot spend the same accepted cash twice',async()=>{
 const ao=client('ao');const results=await Promise.allSettled([spend(ao,'one','early',20000,'2026-01-02T01:00:00Z'),spend(ao,'two','early',20000,'2026-01-02T01:00:00Z')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await getDoc(d(ao,'walletProof/early'))).data().unspentCents,5000);
});
test('two expense allocations cannot share one balance decrement',async()=>{
 const ao=client('ao'),b=writeBatch(ao);for(const id of ['one','two'])b.set(d(ao,'allocationProof/'+id),{walletId:'early',expenseGroup:'expense',amountCents:5000,occurredAt:new Date('2026-01-02'),recordedAt:serverTimestamp(),recordedBy:'ao'});b.update(d(ao,'walletProof/early'),{unspentCents:20000,revision:1,lastAllocation:'one'});await assertFails(b.commit());
});
