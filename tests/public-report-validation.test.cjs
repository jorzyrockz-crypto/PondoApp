const test=require('node:test'),assert=require('node:assert/strict');
const {buildPublicReport}=require('../functions/projection.js');
const {validatePublicReport}=require('../functions/validate.cjs');
const snap={funds:[{id:'f',initialAmount:25}],txs:[{fundId:'f',type:'OUT',date:'2026-01-01',amount:5}],projects:[],allocations:[],contributionActivities:[],contributors:[],contributionPayments:[]};
const selected={funds:true};
const report=()=>buildPublicReport(snap,selected);
test('accepts a valid minimal projection and returns an independent copy',()=>{let input=report(),output=validatePublicReport(input,selected);assert.deepEqual(output,input);assert.notEqual(output,input)});
test('rejects private and unexpected properties at every level',()=>{
 for(const change of [r=>r.notes='secret',r=>r.funds[0].payee='Alice',r=>r.funds[0].transactions[0].reference='123']){let r=report();change(r);assert.throws(()=>validatePublicReport(r,selected),/Invalid/)}
});
test('rejects non-generic labels and disabled views',()=>{
 let r=report();r.funds[0].transactions[0].label='Paid Alice';assert.throws(()=>validatePublicReport(r,selected));
 r=report();r.projects=[];assert.throws(()=>validatePublicReport(r,selected));
 r=report();r.funds[0].label='Sensitive name';assert.throws(()=>validatePublicReport(r,selected));
});
test('rejects inconsistent totals, unsafe numbers and invalid dates',()=>{
 for(const change of [r=>r.funds[0].spentCents=1,r=>r.funds[0].balanceCents=100,r=>r.funds[0].transactions[0].date='2026-02-30',r=>r.funds[0].receivedCents=Infinity]){let r=report();change(r);assert.throws(()=>validatePublicReport(r,selected))}
});
test('enforces record limits and avoids silently truncating the report',()=>{
 const r=report();r.funds[0].transactions=Array.from({length:3001},()=>({date:'2026-01-01',label:'Fund expense',amountCents:0,direction:'OUT'}));
 assert.throws(()=>validatePublicReport(r,selected),/Invalid/);
});
test('requires explicitly selected scopes',()=>{
 const r=report();assert.throws(()=>validatePublicReport(r,{}),/Invalid/);
});
