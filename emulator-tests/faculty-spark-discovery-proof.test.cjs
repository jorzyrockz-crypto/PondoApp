'use strict';
// Isolated discovery fixture; never deploy as production rules.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing'),api=require('firebase/firestore');
const {createIntegratedClient}=require('../faculty-fund-spark-client.js'),{createSparkDiscovery}=require('../faculty-fund-spark-discovery.js');
const PROJECT='demo-pondo-security',root='organizations/school';if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback emulator first');
let env;test.before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-discovery-proof.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['reviewer','reviewer']])await api.setDoc(api.doc(db,`${root}/members/${uid}`),{uid,role});});});test.after(async()=>{if(env)await env.cleanup()});
const db=uid=>env.authenticatedContext(uid).firestore(),ref=(d,p)=>api.doc(d,`${root}/${p}`),client=(d,uid)=>createIntegratedClient({db:d,api,orgId:'school',uid,useRevision:true,trackRemittanceReleases:true}),get=async(d,p)=>(await api.getDoc(ref(d,p))).data();
async function base(){const owner=db('owner'),aoDb=db('ao'),presDb=db('president'),reviewer=db('reviewer'),ao=client(aoDb,'ao'),pres=client(presDb,'president');await client(owner,'owner').assignPresident('president','assignment');await ao.createPerson('teacher','Ana');await ao.createPayment('p1',{personId:'teacher',absenceDate:'2024-01-01',paymentDate:'2024-01-02',amountCents:25000});await ao.createPayment('p2',{personId:'teacher',absenceDate:'2024-01-02',paymentDate:'2024-01-02',amountCents:25000});return {owner,aoDb,presDb,reviewer,ao,pres};}
async function altered(d,path,update){const revision=await get(d,'sparkDiscoveryRevision/current'),b=api.writeBatch(d);b.update(ref(d,path),update);b.set(ref(d,'sparkDiscoveryRevision/current'),{revision:revision.revision+1,updatedAt:api.serverTimestamp(),updatedBy:'ao'});return b.commit();}

test('remittance release counter is updated atomically, safely retried and queryable',async()=>{
 const {aoDb,reviewer,ao}=await base();await ao.createRemittance('r',['p1','p2']);await ao.addPayment('r','p1');await ao.addPayment('r','p2');let r=await get(aoDb,'sparkDiscoveryRemittances/r');assert.equal(r.linkedCount,2);assert.equal(r.needsRelease,false);await ao.cancelRemittance('r','Wrong handover');r=await get(aoDb,'sparkDiscoveryRemittances/r');assert.equal(r.needsRelease,true);assert.equal(r.linkedCount,2);
 await assertFails(client(reviewer,'reviewer').releasePayment('r','p1'));await ao.releasePayment('r','p1');assert.equal((await ao.releasePayment('r','p1')).replayed,true);r=await get(aoDb,'sparkDiscoveryRemittances/r');assert.equal(r.needsRelease,true);assert.equal(r.linkedCount,1);await ao.releasePayment('r','p2');r=await get(aoDb,'sparkDiscoveryRemittances/r');assert.equal(r.needsRelease,false);assert.equal(r.linkedCount,0);
});

test('modified clients cannot hide required releases or decrement counts without unlinking',async()=>{
 const {aoDb,ao}=await base();await ao.createRemittance('r',['p1','p2']);await ao.addPayment('r','p1');
 await assertFails(altered(aoDb,'sparkDiscoveryPayments/p1',{remittanceId:null}));await assertFails(altered(aoDb,'sparkDiscoveryRemittances/r',{linkedCount:0,needsRelease:false,lastReleasedPaymentId:'p1'}));
 await assertFails(altered(aoDb,'sparkDiscoveryRemittances/r',{status:'cancelled',cancelledBy:'ao',cancelledAt:api.serverTimestamp(),reason:'Test',needsRelease:false}));await ao.cancelRemittance('r','Test');await assertFails(altered(aoDb,'sparkDiscoveryRemittances/r',{linkedCount:0,needsRelease:false,lastReleasedPaymentId:'p1'}));await assertFails(altered(aoDb,'sparkDiscoveryPayments/p1',{remittanceId:null}));
 await ao.releasePayment('r','p1');await assertFails(altered(aoDb,'sparkDiscoveryRemittances/r',{linkedCount:0,needsRelease:true,lastReleasedPaymentId:'p1'}));
});

test('President correction makes accepted payments discoverable for release',async()=>{
 const {aoDb,ao,pres}=await base();await ao.createRemittance('r',['p1']);await ao.addPayment('r','p1');await ao.submitRemittance('r');await pres.accept('r');assert.equal((await get(aoDb,'sparkDiscoveryRemittances/r')).needsRelease,false);await ao.requestCorrection('cor','r','Wrong receipt');await pres.decideCorrection('cor','approved');let r=await get(aoDb,'sparkDiscoveryRemittances/r');assert.equal(r.status,'voided');assert.equal(r.needsRelease,true);assert.equal(r.linkedCount,1);await ao.releasePayment('r','p1');r=await get(aoDb,'sparkDiscoveryRemittances/r');assert.equal(r.needsRelease,false);
});

test('bounded discovery finds each category without scanning completed records and pins revision',async()=>{
 const {aoDb,ao}=await base();await ao.createRemittance('draft1',['p1']);await ao.createRemittance('draft2',['p2']);await ao.addPayment('draft1','p1');await ao.cancelRemittance('draft1','Wrong');await ao.createExpense('exp1',{amountCents:10000,description:'Paper',payee:'Store',occurredAt:new Date('2024-01-01T00:00:00Z')});let max=0,queries=0;const counted={...api,getDocsFromServer:async q=>{const s=await api.getDocsFromServer(q);max=Math.max(max,s.size);queries++;return s}},pager=createSparkDiscovery({db:aoDb,api:counted,orgId:'school',isCurrent:()=>true,pageSize:1});
 let page=await pager.next('draftRemittances');assert.deepEqual(page.items.map(x=>x.id),['draft2']);assert.equal(page.complete,false);page=await pager.next('releaseRemittances');assert.deepEqual(page.items.map(x=>x.id),['draft1']);assert.equal(page.complete,false);page=await pager.next('expenses');assert.deepEqual(page.items.map(x=>x.id),['exp1']);assert.equal(page.complete,true);assert.equal(queries,3);assert.ok(max<=2);
 await ao.releasePayment('draft1','p1');await assert.rejects(pager.next('releaseRemittances'),/restart recovery discovery/);pager.reset();page=await pager.next('releaseRemittances');assert.equal(page.items.length,0);
});

test('acceptance racing cancellation never hides a cancelled linked payment',async()=>{
 const {aoDb,ao,pres}=await base();await ao.createRemittance('r',['p1']);await ao.addPayment('r','p1');await ao.submitRemittance('r');const results=await Promise.allSettled([ao.cancelRemittance('r','Cancel'),pres.accept('r')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const r=await get(aoDb,'sparkDiscoveryRemittances/r');assert.ok(['cancelled','accepted'].includes(r.status));assert.equal(r.needsRelease,r.status==='cancelled');assert.equal(r.linkedCount,1);
});
