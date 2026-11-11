const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPublicReport}=require('../functions/projection.js');
const snapshot=()=>({
 funds:[{id:'secret-fund',name:'Secret name',initialAmount:100}],
 txs:[{id:'secret-tx',fundId:'secret-fund',projectId:'secret-project',type:'OUT',amount:20,date:'2026-01-15',description:'Alice private',payee:'Alice',notes:'secret notes',receiptImage:'secret receipt'}],
 projects:[{id:'secret-project',name:'Private project'}],allocations:[{fundId:'secret-fund',projectId:'secret-project',amount:50}],
 contributionActivities:[{id:'secret-activity',title:'Private class'}],contributors:[{id:'secret-person',activityId:'secret-activity',name:'Alice',expected:100}],
 contributionPayments:[{id:'secret-payment',contributorId:'secret-person',date:'2026-01-16',amount:40,receivedBy:'Alice',reference:'secret reference'}],
});
test('only selected views are included and sensitive fields are excluded',()=>{
 const r=buildPublicReport(snapshot(),{funds:true,projects:true,contributions:true});const json=JSON.stringify(r);
 for(const secret of ['Alice','secret','Private','receipt','reference','name'])assert.equal(json.includes(secret),false);
 assert.equal(r.funds[0].receivedCents,10000);assert.equal(r.funds[0].balanceCents,8000);
 assert.equal(r.projects[0].allocatedCents,5000);assert.equal(r.projects[0].spentCents,2000);
 assert.equal(r.contributions[0].outstandingCents,6000);assert.equal(r.contributions[0].transactions[0].label,'Contribution payment');
 assert.deepEqual(buildPublicReport(snapshot(),{funds:true}).projects,undefined);
 assert.deepEqual(buildPublicReport(snapshot(),{}),{version:1});
});
test('rejects malformed dates and money instead of publishing incorrect values',()=>{
 let s=snapshot();s.txs[0].date='2026-02-30';assert.throws(()=>buildPublicReport(s,{funds:true}),/date/);
 s=snapshot();s.contributionPayments[0].amount=Infinity;assert.throws(()=>buildPublicReport(s,{contributions:true}),/amount/);
});
test('does not mutate private records',()=>{let s=snapshot(),before=JSON.stringify(s);buildPublicReport(s,{funds:true,projects:true,contributions:true});assert.equal(JSON.stringify(s),before)});
