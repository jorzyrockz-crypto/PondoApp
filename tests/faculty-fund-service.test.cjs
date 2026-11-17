'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFacultyFundService}=require('../faculty-fund-functions/faculty-fund-service.cjs');
// This test double serializes transactions. It exercises the service adapter,
// but is not a Firestore emulator or an authorization-rules test.
function memoryDb(){
 const store=new Map();let queue=Promise.resolve();
 const db={store,doc:path=>({path}),seed:(path,data)=>store.set(path,structuredClone(data)),runTransaction:fn=>{
  const work=async()=>{const writes=[];const tx={get:async ref=>({exists:store.has(ref.path),data:()=>structuredClone(store.get(ref.path))}),set:(ref,data)=>writes.push(['set',ref.path,structuredClone(data)]),create:(ref,data)=>writes.push(['create',ref.path,structuredClone(data)])};
   const result=await fn(tx);for(const [kind,path] of writes)if(kind==='create'&&store.has(path))throw Error('exists');for(const [,path,data] of writes)store.set(path,data);return result;};
  const result=queue.then(work);queue=result.catch(()=>{});return result;
 }};return db;
}
function env(){
 const db=memoryDb(),root='organizations/org~my school';for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['other','project-manager']])db.seed(`${root}/members/${uid}`,{uid,role});
 let now=new Date('2026-11-09T10:00:00.000Z'),counter=0,defaultPersonId=null;const call=createFacultyFundService({db,clock:()=>now});
 const invoke=(uid,operation,fields={},id=String(++counter).padStart(32,'0'))=>call({auth:uid?{uid}:null,input:{orgId:'org~my school',requestId:id,operation,...fields,...(operation==='recordPayment'&&fields.personId==='faculty-1'&&defaultPersonId?{personId:defaultPersonId}:{})}});
 return {db,root,invoke,setTime:value=>now=new Date(value),setPerson:value=>defaultPersonId=value};
}
const payment={personId:'faculty-1',memberName:'Teacher One',absenceDate:'2026-11-08',paymentDate:'2026-11-09'};
async function setup(){const e=env();await e.invoke('owner','assignPresident',{presidentUid:'president'});const p=await e.invoke('ao','registerPerson',{name:'Teacher One'});e.setPerson(p.personId);return e;}
const fails=(promise,code)=>assert.rejects(promise,e=>e.code===code);
test('only an owner can assign a current organization member and spoofed identity is ignored',async()=>{
 const e=env();await fails(e.invoke(null,'assignPresident',{presidentUid:'president'}),'unauthenticated');await fails(e.invoke('other','assignPresident',{presidentUid:'president',role:'owner',uid:'owner'}),'permission-denied');await fails(e.invoke('owner','assignPresident',{presidentUid:'outsider'}),'failed-precondition');
 await e.invoke('owner','assignPresident',{presidentUid:'president'});assert.equal(e.db.store.get(`${e.root}/facultyFund/config`).presidentUid,'president');assert.equal(e.db.store.get(`${e.root}/facultyFund/state`).audit[0].actorUid,'owner');
});
test('only assigned current President accepts; request fields cannot forge role, identity, or time',async()=>{
 const e=await setup(),p=await e.invoke('ao','recordPayment',{...payment,uid:'owner'});const r=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});
 await fails(e.invoke('other','accept',{remittanceId:r.remittanceId,uid:'president',now:'2000-01-01T00:00:00.000Z'}),'failed-precondition');e.setTime('2026-11-09T13:12:23.000Z');await e.invoke('president','accept',{remittanceId:r.remittanceId,now:'2000-01-01T00:00:00.000Z'});
 const entry=e.db.store.get(`${e.root}/facultyFund/state`).remittances[0];assert.equal(entry.acceptedAt,'2026-11-09T13:12:23.000Z');assert.equal(entry.acceptedByUid,'president');
});
test('idempotent retries return same result, changed request payload is rejected, removed user cannot replay',async()=>{
 const e=await setup(),id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';const first=await e.invoke('ao','recordPayment',payment,id),retry=await e.invoke('ao','recordPayment',payment,id);assert.equal(first.paymentId,retry.paymentId);assert.equal(retry.replayed,true);assert.equal(e.db.store.get(`${e.root}/facultyFund/state`).payments.length,1);
 await fails(e.invoke('ao','recordPayment',{...payment,absenceDate:'2026-11-07'},id),'already-exists');e.db.store.delete(`${e.root}/members/ao`);await fails(e.invoke('ao','recordPayment',payment,id),'permission-denied');
});
test('competing submissions do not assign the same payment twice',async()=>{
 const e=await setup(),p=await e.invoke('ao','recordPayment',payment);const a=e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]}),b=e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});const results=await Promise.allSettled([a,b]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(e.db.store.get(`${e.root}/facultyFund/state`).remittances.length,1);
});
test('reassignment does not transfer pending consent; cancelled pending payment can be resubmitted',async()=>{
 const e=await setup(),p=await e.invoke('ao','recordPayment',payment),r=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});await e.invoke('owner','assignPresident',{presidentUid:'other'});await fails(e.invoke('other','accept',{remittanceId:r.remittanceId}),'failed-precondition');
 e.db.store.delete(`${e.root}/members/other`);await e.invoke('ao','cancelRemittance',{remittanceId:r.remittanceId,reason:'President changed'});await e.invoke('owner','assignPresident',{presidentUid:'president'});const next=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});assert.notEqual(r.remittanceId,next.remittanceId);
});
test('receipt confirmations only occur after acceptance and preserve independent statuses',async()=>{
 const e=await setup(),p=await e.invoke('ao','recordPayment',payment),r=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});await fails(e.invoke('ao','markMemberPrinted',{paymentId:p.paymentId}),'failed-precondition');await e.invoke('president','accept',{remittanceId:r.remittanceId});await e.invoke('ao','markMemberBatchPrinted',{paymentIds:[p.paymentId]});let s=e.db.store.get(`${e.root}/facultyFund/state`);assert.ok(s.payments[0].memberReceiptPrintedAt);assert.equal(s.remittances[0].receiptPrintedAt,null);await e.invoke('ao','markRemittancePrinted',{remittanceId:r.remittanceId});s=e.db.store.get(`${e.root}/facultyFund/state`);assert.ok(s.remittances[0].receiptPrintedAt);
});
test('invalid inputs and oversized state fail without writing an operation receipt',async()=>{
 const e=await setup();await fails(e.invoke('ao','recordPayment',{...payment,paymentDate:'2026-11-10'}),'failed-precondition');await fails(e.invoke('ao','submitRemittance',{paymentIds:Array(201).fill('x')}),'invalid-argument');
 const state=e.db.store.get(`${e.root}/facultyFund/state`);state.audit.push({large:'x'.repeat(450001)});e.db.seed(`${e.root}/facultyFund/state`,state);const before=e.db.store.size;await fails(e.invoke('ao','recordPayment',payment),'resource-exhausted');assert.equal(e.db.store.size,before);assert.equal(e.db.store.get(`${e.root}/facultyFund/state`).payments.length,0);
});
test('protected storage is client-read-only, operations are private, and service is not exposed for production',()=>{
 const fs=require('node:fs');const rules=fs.readFileSync('firestore.rules','utf8'),index=fs.readFileSync('functions/index.cjs','utf8');
 assert.match(rules,/match \/facultyFund\/\{docId\} \{[\s\S]*?allow write: if false;/);assert.match(rules,/match \/facultyFundOperations\/\{operationId\} \{\s*allow read, write: if false;/);assert.doesNotMatch(index,/faculty-fund-service/);
});
test('cash expenses are atomic, require accepted funds, are idempotent and retain void audit',async()=>{
 const {facultyCashLedger}=require('../faculty-fund-functions/faculty-fund-ledger.cjs'),e=await setup();const p=await e.invoke('ao','recordPayment',payment),r=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});const expense={occurredAt:'2026-11-09T10:00:00.000Z',amountCents:10000,description:'Activity supplies',payee:'Local supplier'};
 await fails(e.invoke('ao','recordExpense',expense),'failed-precondition');await e.invoke('president','accept',{remittanceId:r.remittanceId});await fails(e.invoke('other','recordExpense',expense),'failed-precondition');
 const token='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',x=await e.invoke('ao','recordExpense',expense,token),replay=await e.invoke('ao','recordExpense',expense,token);assert.equal(x.expenseId,replay.expenseId);assert.equal(replay.replayed,true);let state=e.db.store.get(`${e.root}/facultyFund/state`);assert.equal(facultyCashLedger(state).balanceCents,15000);assert.equal(state.expenses.length,1);
 await e.invoke('ao','voidExpense',{expenseId:x.expenseId,reason:'Incorrect receipt'});state=e.db.store.get(`${e.root}/facultyFund/state`);assert.equal(facultyCashLedger(state).balanceCents,25000);assert.equal(state.expenses[0].voidReason,'Incorrect receipt');await fails(e.invoke('ao','voidPayment',{paymentId:p.paymentId,reason:'Wrong'}),'failed-precondition');
});
test('competing expenses cannot exceed accepted balance',async()=>{
 const e=await setup(),p=await e.invoke('ao','recordPayment',payment),r=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});await e.invoke('president','accept',{remittanceId:r.remittanceId});
 const expense={occurredAt:'2026-11-09T10:00:00.000Z',amountCents:20000,description:'Activity',payee:'Supplier'};const results=await Promise.allSettled([e.invoke('ao','recordExpense',expense),e.invoke('ao','recordExpense',expense)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(e.db.store.get(`${e.root}/facultyFund/state`).expenses.length,1);
});
test('accepted receipt and correction remain available after officeholder leaves',async()=>{
 const e=await setup(),p=await e.invoke('ao','recordPayment',payment),r=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});await e.invoke('president','accept',{remittanceId:r.remittanceId});e.db.store.delete(`${e.root}/members/president`);await e.invoke('ao','markMemberPrinted',{paymentId:p.paymentId});const x=await e.invoke('ao','recordExpense',{occurredAt:'2026-11-09T10:00:00.000Z',amountCents:1000,description:'Paper',payee:'Shop'});await e.invoke('ao','voidExpense',{expenseId:x.expenseId,reason:'Duplicate'});await fails(e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]}),'failed-precondition');
});
test('can record and correct an unremitted collection while no President is assigned',async()=>{
 const e=env();const person=await e.invoke('ao','registerPerson',{name:'Teacher One'});e.setPerson(person.personId);const p=await e.invoke('ao','recordPayment',payment);await fails(e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]}),'failed-precondition');await e.invoke('ao','voidPayment',{paymentId:p.paymentId,reason:'Recorded for wrong person'});const state=e.db.store.get(`${e.root}/facultyFund/state`);assert.equal(state.payments[0].voidReason,'Recorded for wrong person');
});
test('faculty identity is selected from the protected roster, not client-supplied names',async()=>{
 const e=await setup();const p=await e.invoke('ao','recordPayment',{...payment,memberName:'Fake injected name'});let state=e.db.store.get(`${e.root}/facultyFund/state`);assert.equal(state.payments[0].memberName,'Teacher One');await fails(e.invoke('ao','recordPayment',{...payment,personId:'unknown'}),'failed-precondition');await fails(e.invoke('ao','recordPayment',{...payment,memberName:'Another spoof'}),'failed-precondition');
 const same=await e.invoke('ao','registerPerson',{name:'Teacher One'});const p2=await e.invoke('ao','recordPayment',{...payment,personId:same.personId});assert.notEqual(p.paymentId,p2.paymentId);state=e.db.store.get(`${e.root}/facultyFund/state`);assert.equal(state.payments.length,2);assert.notEqual(state.payments[0].personId,state.payments[1].personId);
});
test('only current President can approve accepted remittance correction',async()=>{
 const e=await setup(),p=await e.invoke('ao','recordPayment',payment),r=await e.invoke('ao','submitRemittance',{paymentIds:[p.paymentId]});await e.invoke('president','accept',{remittanceId:r.remittanceId});await e.invoke('ao','requestRemittanceVoid',{remittanceId:r.remittanceId,reason:'Mistaken batch'});await fails(e.invoke('ao','approveRemittanceVoid',{remittanceId:r.remittanceId}),'failed-precondition');await e.invoke('president','approveRemittanceVoid',{remittanceId:r.remittanceId});const state=e.db.store.get(`${e.root}/facultyFund/state`);assert.equal(state.remittances[0].status,'voided');assert.equal(state.remittances[0].voidedByUid,'president');assert.equal(state.remittances[0].acceptedByUid,'president');
});
