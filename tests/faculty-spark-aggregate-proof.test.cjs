'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createIntegratedClient}=require('../faculty-fund-spark-client.js');
const {projectFacultySpark:project}=require('../faculty-fund-spark-projection.js');
const {empty,advance}=require('../faculty-fund-spark-aggregate-proof.cjs');

// A deliberately non-authoritative memory transaction harness. It compares
// every real client transaction's contribution delta with full reconciliation.
function harness(){
 const data=new Map(),root='organizations/school/',at=new Date('2026-01-02T00:00:00Z');
 const api={doc:(_db,path)=>path,serverTimestamp:()=>new Date(at),runTransaction:async(_db,fn)=>{
  const writes=[],tx={get:async path=>({exists:()=>data.has(path),data:()=>structuredClone(data.get(path))}),set:(path,v)=>writes.push(['set',path,structuredClone(v)]),update:(path,v)=>writes.push(['update',path,structuredClone(v)])};
  const result=await fn(tx);for(const [op,path,v] of writes){if(op==='update'&&!data.has(path))throw Error('missing fixture document');data.set(path,op==='update'?{...data.get(path),...v}:v);}return result;
 }};
 const make=uid=>createIntegratedClient({db:{},api,orgId:'school',uid,useRevision:true,trackRemittanceReleases:true});
 const paths={people:'People',payments:'Payments',slots:'PaymentSlots',remittances:'Remittances',lines:'Lines',wallets:'Wallets',expenses:'ExpenseDrafts',allocations:'Allocations',corrections:'Corrections'};
 function snapshot(){const s={confirmed:true};for(const [field,path] of Object.entries(paths)){const prefix=root+'sparkDiscovery'+path+'/';s[field]=[...data].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({...structuredClone(value),id:key.slice(prefix.length)}));}return s;}
 const pairs=(before,after,kind)=>{const map=a=>new Map(a.map(x=>[x.id,x]));const a=map(before),b=map(after);return [...new Set([...a.keys(),...b.keys()])].filter(id=>JSON.stringify(a.get(id))!==JSON.stringify(b.get(id))).map(id=>({kind,id,before:a.get(id)||null,after:b.get(id)||null}));};
 function handovers(s){const w=new Map(s.wallets.map(x=>[x.id,x])),c=new Map(s.corrections.map(x=>[x.id,x]));return s.remittances.map(r=>({id:r.id,remittance:r,wallet:w.get(r.id)||null,correction:r.correctionId?c.get(r.correctionId)||null:null}));}
 let aggregate=empty();
 async function step(fn){const before=snapshot(),prior=aggregate,result=await fn(),after=snapshot();const revision=data.get(root+'sparkDiscoveryRevision/current')?.revision||0;
  if(result.replayed){assert.equal(revision,prior.revision);return result;}
  const changes=[...pairs(before.payments,after.payments,'payment'),...pairs(before.expenses,after.expenses,'expense'),...pairs(handovers(before),handovers(after),'handover')];aggregate=advance(prior,revision,changes);
  const p=project(after);for(const k of ['receivedCents','acceptedCents','spentCents','reservedCents','frozenCents','spendableCents','unremittedCents','balanceCents'])assert.equal(aggregate[k],p[k],k+' at revision '+revision);
  return result;
 }
 return {owner:make('owner'),ao:make('ao'),pres:make('president'),step,get aggregate(){return aggregate}};
}
test('candidate aggregate tracks full reconciliation through partial and replayed financial operations',async()=>{
 const f=harness(),{step,ao,pres,owner}=f;
 await step(()=>owner.assignPresident('president','assign'));await step(()=>ao.createPerson('p','Ana'));
 for(const [id,absence] of [['one','2026-01-01'],['two','2026-01-02']])await step(()=>ao.createPayment(id,{personId:'p',absenceDate:absence,paymentDate:'2026-01-02',amountCents:25000}));
 await step(()=>ao.createRemittance('r',['one','two']));await step(()=>ao.addPayment('r','one'));await step(()=>ao.addPayment('r','two'));await step(()=>ao.submitRemittance('r'));await step(()=>pres.accept('r'));await step(()=>pres.accept('r'));
 const e={amountCents:30000,description:'Books',payee:'Shop',occurredAt:new Date('2026-01-03T00:00:00Z')};await step(()=>ao.createExpense('e',e));await step(()=>ao.allocate('e','r','a',30000));assert.equal(f.aggregate.reservedCents,30000);await step(()=>ao.finalizeExpense('e'));assert.equal(f.aggregate.spentCents,30000);
 await step(()=>ao.requestCorrection('c','r','Review'));assert.equal(f.aggregate.frozenCents,20000);await step(()=>pres.decideCorrection('c','declined','Confirmed'));assert.equal(f.aggregate.spendableCents,20000);
 await step(()=>ao.beginVoid('e','Wrong expense'));await step(()=>ao.release('a'));await step(()=>ao.release('a'));await step(()=>ao.finishVoid('e'));assert.equal(f.aggregate.spentCents,0);
 await step(()=>ao.createExpense('draft',e));await step(()=>ao.allocate('draft','r','b',10000));await step(()=>ao.cancelExpense('draft','Cancelled'));await step(()=>ao.release('b'));await step(()=>ao.finishCancellation('draft'));
 await step(()=>ao.requestCorrection('c2','r','Duplicate'));await step(()=>pres.decideCorrection('c2','approved'));assert.equal(f.aggregate.unremittedCents,50000);await step(()=>ao.releasePayment('r','one'));await step(()=>ao.releasePayment('r','two'));await step(()=>ao.voidPayment('one','Duplicate'));assert.equal(f.aggregate.balanceCents,25000);
});
test('invalid revisions, duplicates, malformed records and unbalanced deltas fail closed',()=>{
 const z=empty();assert.throws(()=>advance(z,2,[]),/revision/);assert.throws(()=>advance(z,1,[{kind:'payment',id:'p',before:null,after:{amountCents:100,voidedAt:null}},{kind:'payment',id:'p',before:null,after:{amountCents:100,voidedAt:null}}]),/duplicate/);
 assert.throws(()=>advance(z,1,[{kind:'expense',id:'e',before:null,after:{status:'draft',amountCents:50,allocatedCents:50,count:1}}]),/reconcile/);
 assert.throws(()=>advance(z,1,[{kind:'payment',id:'p',before:null,after:{amountCents:0,voidedAt:null}}]),/amount/);
 assert.throws(()=>advance(z,1,[{kind:'handover',id:'r',before:null,after:{remittance:{id:'other',status:'draft',amountCents:0},wallet:null,correction:null}}]),/ID/);
 const near={revision:1,receivedCents:Number.MAX_SAFE_INTEGER,acceptedCents:0,spentCents:0,reservedCents:0,frozenCents:0,spendableCents:0};assert.throws(()=>advance(near,2,[{kind:'payment',id:'p',before:null,after:{amountCents:1,voidedAt:null}}]),/overflow/);
});
test('aggregate handles multi-wallet reservations, frozen release and replacement workflows',async()=>{
 const f=harness(),{step,ao,pres,owner}=f;await step(()=>owner.assignPresident('president','assign'));await step(()=>ao.createPerson('p','Ana'));
 for(const [id,day] of [['p1','2026-01-01'],['p2','2026-01-02']]){await step(()=>ao.createPayment(id,{personId:'p',absenceDate:day,paymentDate:'2026-01-02',amountCents:25000}));await step(()=>ao.createRemittance('r'+id,[id]));await step(()=>ao.addPayment('r'+id,id));await step(()=>ao.submitRemittance('r'+id));await step(()=>pres.accept('r'+id));}
 await step(()=>ao.createExpense('e',{amountCents:40000,description:'Books',payee:'Shop',occurredAt:new Date('2026-01-03')}));await step(()=>ao.allocate('e','rp1','a1',25000));await step(()=>ao.allocate('e','rp2','a2',15000));await step(()=>ao.finalizeExpense('e'));await step(()=>ao.requestCorrection('c','rp2','Check'));assert.equal(f.aggregate.frozenCents,10000);
 await step(()=>ao.beginVoid('e','Wrong'));await step(()=>ao.release('a2'));assert.equal(f.aggregate.frozenCents,25000);assert.equal(f.aggregate.spentCents,25000);await step(()=>ao.release('a1'));await step(()=>ao.finishVoid('e'));await step(()=>pres.decideCorrection('c','approved'));await step(()=>ao.releasePayment('rp2','p2'));await step(()=>ao.voidPayment('p2','Duplicate'));
 await step(()=>ao.createPayment('replacement',{personId:'p',absenceDate:'2026-01-02',paymentDate:'2026-01-02',amountCents:10000}));await step(()=>ao.createRemittance('decline',['replacement']));await step(()=>ao.addPayment('decline','replacement'));await step(()=>ao.submitRemittance('decline'));await step(()=>pres.declineRemittance('decline','Recheck'));await step(()=>ao.releasePayment('decline','replacement'));assert.equal(f.aggregate.balanceCents,35000);
});
