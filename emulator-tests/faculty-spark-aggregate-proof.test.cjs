'use strict';
// This project/ruleset is isolated and synthetic; no app or live data is used.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing'),api=require('firebase/firestore');
const {createProofClient}=require('./fixtures/faculty-spark-aggregate-proof-client.cjs');
const projectId='demo-pondo-security',root='organizations/school';if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback emulator first');
let env;test.before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-aggregate-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const [id,role] of [['owner','owner'],['ao','disbursing'],['other','disbursing'],['reviewer','reviewer']])await api.setDoc(api.doc(d,`${root}/members/${id}`),{role});});});test.after(async()=>{if(env)await env.cleanup()});
const db=uid=>env.authenticatedContext(uid).firestore(),ref=(d,collection,id)=>api.doc(d,`${root}/aggregateProof${collection}/${id}`),get=async(d,col,id)=>(await api.getDocFromServer(ref(d,col,id))).data(),client=(d,uid)=>createProofClient({db:d,api,orgId:'school',uid});
const payment=(slot,amount,uid='ao')=>({slotId:slot,amountCents:amount,createdAt:api.serverTimestamp(),createdBy:uid,voidedAt:null,voidedBy:null,voidReason:null});
const summary=(revision,cents,action,p,s,uid='ao')=>({revision,receivedCents:cents,lastAction:action,lastPaymentId:p,lastSlotId:s,updatedAt:api.serverTimestamp(),updatedBy:uid});
async function initialized(){const owner=db('owner'),ao=db('ao');await client(owner,'owner').initialize();return {owner,ao,c:client(ao,'ao')};}

test('isolated initialization, idempotent payment, void and replacement agree with protected total',async()=>{
 const {owner,ao,c}=await initialized();assert.equal((await client(owner,'owner').initialize()).replayed,true);
 assert.equal((await c.create('p','slot',25000)).replayed,false);assert.equal((await c.create('p','slot',25000)).replayed,true);assert.equal((await get(ao,'Totals','current')).receivedCents,25000);
 assert.equal((await c.voidPayment('p','Duplicate')).replayed,false);assert.equal((await c.voidPayment('p','Duplicate')).replayed,true);assert.equal((await c.create('p','slot',25000)).voided,true);await assert.rejects(c.create('p','slot',30000),/different/);
 await c.create('new','slot',12000);const t=await get(ao,'Totals','current');assert.equal(t.revision,3);assert.equal(t.receivedCents,12000);assert.equal((await get(ao,'Slots','slot')).activePaymentId,'new');assert.ok((await get(ao,'Payments','p')).voidedAt);
});

test('initialization is owner-only, exactly zero, and cannot be overwritten or deleted',async()=>{
 const ao=db('ao'),reviewer=db('reviewer'),owner=db('owner'),outsider=db('outsider');await assertFails(client(ao,'ao').initialize());await assertFails(client(reviewer,'reviewer').initialize());await assertFails(api.getDoc(ref(outsider,'Totals','current')));
 await assertFails(api.setDoc(ref(owner,'Totals','current'),summary(0,1,'init','','','owner')));await client(owner,'owner').initialize();await assertFails(api.deleteDoc(ref(owner,'Totals','current')));await assertFails(api.setDoc(ref(owner,'Totals','current'),summary(0,0,'init','','','owner')));
});

test('modified clients cannot write only a total, payment or slot, or fake delta and revision',async()=>{
 const {ao}=await initialized(),p=ref(ao,'Payments','p'),s=ref(ao,'Slots','slot'),t=ref(ao,'Totals','current');
 await assertFails(api.setDoc(p,payment('slot',25000)));await assertFails(api.setDoc(s,{activePaymentId:'p'}));await assertFails(api.setDoc(t,summary(1,25000,'create','p','slot')));
 for(const [revision,cents] of [[1,24999],[1,25001],[2,25000],[0,25000]]){const b=api.writeBatch(ao);b.set(p,payment('slot',25000));b.set(s,{activePaymentId:'p'});b.set(t,summary(revision,cents,'create','p','slot'));await assertFails(b.commit());}
 const missingSlot=api.writeBatch(ao);missingSlot.set(p,payment('slot',25000));missingSlot.set(t,summary(1,25000,'create','p','slot'));await assertFails(missingSlot.commit());
 const missingPayment=api.writeBatch(ao);missingPayment.set(s,{activePaymentId:'p'});missingPayment.set(t,summary(1,25000,'create','p','slot'));await assertFails(missingPayment.commit());
 assert.equal((await get(ao,'Totals','current')).revision,0);
});

test('one aggregate revision cannot conceal two payment or slot changes',async()=>{
 const {ao}=await initialized(),b=api.writeBatch(ao);b.set(ref(ao,'Payments','p1'),payment('s1',100));b.set(ref(ao,'Slots','s1'),{activePaymentId:'p1'});b.set(ref(ao,'Payments','p2'),payment('s2',200));b.set(ref(ao,'Slots','s2'),{activePaymentId:'p2'});b.set(ref(ao,'Totals','current'),summary(1,100,'create','p1','s1'));await assertFails(b.commit());
 assert.equal((await get(ao,'Totals','current')).revision,0);assert.equal((await api.getDoc(ref(ao,'Payments','p2'))).exists(),false);
});

test('a void cannot change amount, omit slot, double count or use another actor',async()=>{
 const {ao,c}=await initialized();await c.create('p','slot',25000);const p=ref(ao,'Payments','p'),s=ref(ao,'Slots','slot'),t=ref(ao,'Totals','current');
 let b=api.writeBatch(ao);b.update(p,{voidedAt:api.serverTimestamp(),voidedBy:'ao',voidReason:'Duplicate',amountCents:1});b.update(s,{activePaymentId:null});b.set(t,summary(2,0,'void','p','slot'));await assertFails(b.commit());
 b=api.writeBatch(ao);b.update(p,{voidedAt:api.serverTimestamp(),voidedBy:'ao',voidReason:'Duplicate'});b.set(t,summary(2,0,'void','p','slot'));await assertFails(b.commit());
 b=api.writeBatch(ao);b.update(p,{voidedAt:api.serverTimestamp(),voidedBy:'other',voidReason:'Duplicate'});b.update(s,{activePaymentId:null});b.set(t,summary(2,0,'void','p','slot'));await assertFails(b.commit());
 b=api.writeBatch(ao);b.update(p,{voidedAt:api.serverTimestamp(),voidedBy:'ao',voidReason:'Duplicate'});b.update(s,{activePaymentId:null});b.set(t,summary(2,1,'void','p','slot'));await assertFails(b.commit());
 await c.voidPayment('p','Duplicate');await assertFails(api.setDoc(t,summary(3,0,'void','p','slot')));await assertFails(api.deleteDoc(p));await assertFails(api.deleteDoc(s));
});

test('reviewers and outsiders cannot create financial records even in a correct batch',async()=>{
 const {owner}=await initialized();for(const uid of ['reviewer','outsider']){const d=db(uid),b=api.writeBatch(d);b.set(ref(d,'Payments','p'),payment('slot',100,uid));b.set(ref(d,'Slots','slot'),{activePaymentId:'p'});b.set(ref(d,'Totals','current'),summary(1,100,'create','p','slot',uid));await assertFails(b.commit());}
 assert.equal((await get(owner,'Totals','current')).receivedCents,0);
});

test('concurrent payment transactions serialize or fail without breaking the total',async()=>{
 const {ao,c}=await initialized(),other=db('other'),second=client(other,'other');const ops=[()=>c.create('p1','s1',100),()=>second.create('p2','s2',200)];const out=await Promise.allSettled(ops.map(fn=>fn()));assert.ok(out.some(x=>x.status==='fulfilled'));
 // A conflict can require an explicit retry; reuse the exact request ID.
 for(let i=0;i<out.length;i++)if(out[i].status==='rejected')await ops[i]();
 const total=await get(ao,'Totals','current');assert.equal(total.revision,2);assert.equal(total.receivedCents,300);assert.equal((await get(ao,'Slots','s1')).activePaymentId,'p1');assert.equal((await get(ao,'Slots','s2')).activePaymentId,'p2');
});

test('competing payments for one slot cannot both be counted',async()=>{
 const {ao,c}=await initialized(),other=client(db('other'),'other');const result=await Promise.allSettled([c.create('p1','s',100),other.create('p2','s',200)]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);const t=await get(ao,'Totals','current'),slot=await get(ao,'Slots','s'),p=await get(ao,'Payments',slot.activePaymentId);assert.equal(t.revision,1);assert.equal(t.receivedCents,p.amountCents);
});
