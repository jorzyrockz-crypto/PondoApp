'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeSparkDiagnosticExport:make,verifySparkDiagnosticExport:checksum}=require('../faculty-fund-spark-export.js');
const {verifySparkDiagnostic:verify}=require('../faculty-fund-spark-verify.js');
const {projectFacultySpark:project}=require('../faculty-fund-spark-projection.js');
const timestamp=(seconds,nanoseconds=0)=>({seconds,nanoseconds,toMillis(){return seconds*1000+nanoseconds/1e6}});
function snapshot(){
 const accepted=timestamp(1767229200,123456000),occurred=timestamp(1767315600),assigned=timestamp(1767220000,1000);
 const records={people:[{id:'person',name:'Ana'}],payments:[{id:'p',slotId:'person~2026-01-01',personId:'person',memberName:'Ana',absenceDate:'2026-01-01',paymentDate:'2026-01-01',amountCents:25000,remittanceId:'r',voidedAt:null}],slots:[{id:'person~2026-01-01',personId:'person',absenceDate:'2026-01-01',activePaymentId:'p',revision:1}],remittances:[{id:'r',status:'accepted',paymentIds:['p'],count:1,amountCents:25000,acceptedAt:accepted,acceptedBy:'president',presidentUid:'president',correctionId:null}],lines:[{id:'r~p',remittanceId:'r',paymentId:'p',amountCents:25000}],wallets:[{id:'r',status:'open',amountCents:25000,unspentCents:15000,acceptedAt:accepted,revision:1}],expenses:[{id:'e',status:'recorded',amountCents:10000,allocatedCents:10000,count:1,description:'Books',payee:'Store',occurredAt:occurred}],allocations:[{id:'a',expenseId:'e',walletId:'r',amountCents:10000,releasedAt:null,releasedBy:null}],corrections:[],presidentHistory:[{id:'assignment',presidentUid:'president',assignedBy:'owner',assignedAt:assigned}],memberReceipts:[],remittanceReceipts:[]};
 return {revision:5,config:{assignmentId:'assignment',presidentUid:'president',assignedBy:'owner',assignedAt:assigned},records,projection:project({confirmed:true,...records})};
}
const exportCopy=s=>make(s,{orgId:'school',actorUid:'owner',role:'owner'});
const check=(envelope,orgId='school')=>verify({envelope,orgId,verifyChecksum:checksum,project});
test('checks a real export round trip with Firestore timestamps and warns it is not a restore',async()=>{
 const e=JSON.parse(JSON.stringify(await exportCopy(snapshot()))),r=await check(e);assert.equal(r.revision,5);assert.equal(r.counts.payments,1);assert.match(r.notice,/not prove authenticity or completeness/);assert.match(r.notice,/cannot restore/);
});
test('rejects accidental edits and wrong workspace',async()=>{const e=await exportCopy(snapshot());await assert.rejects(check(e,'other'),/another workspace/);e.payload.records.payments[0].amountCents++;await assert.rejects(check(e),/checksum/);});
test('recomputed checksums do not bypass accounting, collection and assignment consistency checks',async()=>{
 for(const [mutate,pattern] of [
  [s=>s.records.wallets[0].unspentCents++,/wallet allocation mismatch/],
  [s=>s.projection.balanceCents++,/totals do not reconcile/],
  [s=>s.config.presidentUid='other',/assignment is inconsistent/],
  [s=>delete s.records.lines,/collections are incomplete/],
  [s=>s.records.people.push(s.records.people[0]),/record ID/],
  [s=>s.records.people=Array.from({length:1001},(_,i)=>({id:String(i)})),/safe limit/],
 ]){const s=snapshot();mutate(s);await assert.rejects(check(await exportCopy(s)),pattern);}
});
test('a consistent forged copy can be checksummed and accepted: checksum is not authentication',async()=>{const s=snapshot();s.records.people[0].name='Someone else';s.records.payments[0].memberName='Someone else';s.projection=project({confirmed:true,...s.records});const r=await check(await exportCopy(s));assert.match(r.notice,/not prove authenticity/);});
test('rejects malformed timestamp encodings even with a matching checksum',async()=>{const s=snapshot();s.records.people[0].createdAt={$timestamp:{seconds:1,nanoseconds:1000000000}};await assert.rejects(check(await exportCopy(s)),/timestamp/);});
