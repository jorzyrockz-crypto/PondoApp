'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const d=require('../faculty-fund-functions/faculty-fund-domain.cjs'),{facultyReport,facultyReportCsv}=require('../faculty-fund-functions/faculty-fund-report.cjs');
const ao={uid:'ao',role:'disbursing',memberConfirmed:true,presidentUid:'p',today:'2026-11-10',now:'2026-11-10T10:00:00.000Z'},pres={uid:'p',presidentUid:'p',memberConfirmed:true,now:'2026-11-10T11:00:00.000Z'};
function sample(){let s={payments:[],expenses:[],remittances:[],audit:[]};s=d.addPayment(s,{id:'p1',personId:'a',memberName:'=HYPERLINK("bad")',absenceDate:'2026-11-01',paymentDate:'2026-11-08'},ao);s=d.addPayment(s,{id:'p2',personId:'b',memberName:'Teacher B',absenceDate:'2026-11-02',paymentDate:'2026-11-10'},ao);s=d.createRemittance(s,{id:'r',paymentIds:['p1','p2']},ao);s=d.decideRemittance(s,'r','accept',pres);return d.addExpense(s,{id:'e',occurredAt:'2026-11-10T11:30:00.000Z',amountCents:10000,description:'School supplies',payee:'Shop'}, {...ao,now:'2026-11-10T12:00:00.000Z'});}
test('Faculty report separates period and opening cash without treating remittance as a transaction',()=>{
 const s=sample(),report=facultyReport(s,{from:'2026-11-10',to:'2026-11-10'});assert.equal(report.scope,'Faculty Fund only');assert.deepEqual([report.openingCents,report.receivedCents,report.spentCents,report.closingCents],[25000,25000,10000,40000]);assert.equal(report.entries.length,2);assert.deepEqual(report.entries.map(x=>x.type).sort(),['IN','OUT']);
 const before=facultyReport(s,{to:'2026-11-09'});assert.deepEqual([before.openingCents,before.receivedCents,before.spentCents,before.closingCents],[0,25000,0,25000]);
});
test('range validation rejects malformed and inverted dates and projection does not mutate data',()=>{
 const s=sample(),before=structuredClone(s);assert.throws(()=>facultyReport(s,{from:'2026-02-30'}),/range/);assert.throws(()=>facultyReport(s,{from:'2026-11-10',to:'2026-11-09'}),/range/);facultyReport(s);assert.deepEqual(s,before);
});
test('CSV escapes spreadsheet formulas, quotes, names and includes precise values',()=>{
 const csv=facultyReportCsv(sample(),{});assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);assert.match(csv,/"250\.00"/);assert.match(csv,/"100\.00"/);assert.match(csv,/"Faculty Fund only"/);assert.ok(csv.startsWith('\ufeff'));
});
