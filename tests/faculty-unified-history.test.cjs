'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ledger=require('../unified-ledger.js');
test('Faculty history includes payments, handovers, incomplete and corrected expenses without duplicating cash',()=>{
 const state={payments:[{id:'p',memberName:'Ana',paymentDate:'2026-02-01',absenceDate:'2026-01-30',amountCents:25000,remittanceId:'r'},{id:'void',memberName:'Ben',paymentDate:'2026-01-01',amountCents:5000,voidedAt:'2026-01-02',voidReason:'Duplicate'}],remittances:[{id:'r',status:'pending',amountCents:25000,submittedAt:'2026-02-03T04:00:00Z',submittedByName:'AO'}],expenses:[{id:'e',status:'recorded',date:'2026-02-05',amountCents:10000,description:'Books',payee:'Store'},{id:'partial',status:'voiding',date:'2026-02-06',amountCents:10000,allocatedCents:4000,description:'Correction'},{id:'draft',status:'draft',date:'2026-02-07',amountCents:3000,description:'Draft'},{id:'v',status:'voided',date:'2026-02-08',amountCents:2000,description:'Cancelled'}]};
 const rows=ledger.build({funds:[{id:'r',name:'Regular',initialAmount:20}],facultyHistory:{state},facultyFundId:'faculty'}),by=id=>rows.find(x=>x.key===id);
 assert.equal(by('faculty-payment:p').impact,'IN');assert.equal(by('faculty-payment:p').status,'Awaiting President acceptance');assert.equal(by('faculty-payment:void').impact,'NONE');assert.equal(by('faculty-handover:r').impact,'NONE');assert.equal(by('faculty-handover:r').status,'Pending');assert.equal(by('faculty-expense:e').impact,'OUT');assert.equal(by('faculty-expense:partial').amount,40);assert.equal(by('faculty-expense:draft').impact,'NONE');assert.equal(by('faculty-expense:v').type,'VOID');
 assert.deepEqual(ledger.totals(rows),{IN:27000,OUT:14000,TRACKING:0});assert.equal(rows.filter(r=>ledger.matches(r,{fund:'faculty'})).length,7);assert.equal(rows.filter(r=>ledger.matches(r,{query:'Ana'})).length,1);assert.equal(rows.filter(r=>ledger.matches(r,{type:'FACULTY'})).length,2);assert.equal(rows.filter(r=>ledger.matches(r,{impact:'NONE',fund:'faculty'})).length,4);
 assert.equal(state.remittances[0].status,'pending');
});

test('Faculty history refuses late results after a workspace change and clears on invalidation',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');let finish;const window={pondoCurrentUser:{uid:'alice'},pondoTeamState:{orgId:'one',uid:'alice',role:'owner',memberConfirmed:true,members:[]},pondoFacultyAPI:{read:()=>new Promise(r=>{finish=r})}};const document={getElementById:()=>null};vm.runInNewContext(fs.readFileSync('faculty-fund-ui.js','utf8'),{window,document,navigator:{onLine:true},clearTimeout,setTimeout});const ui=window.PondoFacultyFundUI;
 const old=ui.refreshHistory();assert.equal(ui.historyView().status,'loading');window.pondoTeamState={...window.pondoTeamState,orgId:'two'};finish({state:{payments:[{id:'private'}],expenses:[],remittances:[]}});await old;assert.equal(ui.historyView().data,null);assert.equal(ui.historyView().status,'unavailable');
 const next=ui.refreshHistory();finish({state:{payments:[],expenses:[],remittances:[]}});await next;assert.equal(ui.historyView().status,'ready');ui.invalidateHistory();assert.equal(ui.historyView().data,null);assert.equal(ui.historyView().status,'unavailable');
});
test('combined dashboard counts Faculty cash once, including unaccepted amounts, without changing the fund records',()=>{
 const funds=[{id:'regular',initialAmount:1000},{id:'donation',initialAmount:100}],transactions=[{id:'in',type:'IN',amount:100},{id:'out',type:'OUT',amount:50}],faculty={ledger:{receivedCents:25000,spentCents:10000,balanceCents:15000,unremittedCents:5000,rows:[{id:'p',type:'IN'},{id:'e',type:'OUT'}]}};
 const before=JSON.stringify({funds,transactions,faculty});const result=ledger.combineDashboard({funds,transactions,faculty});assert.deepEqual(result,{receivedCents:145000,spentCents:15000,balanceCents:130000,transactionCount:4});assert.equal(JSON.stringify({funds,transactions,faculty}),before);assert.deepEqual(ledger.combineDashboard({funds,transactions}),{receivedCents:120000,spentCents:5000,balanceCents:115000,transactionCount:2});
});
test('dashboard refuses inconsistent, missing or overflowing Faculty amounts',()=>{
 for(const faculty of [{ledger:{receivedCents:2,spentCents:1,balanceCents:2,rows:[]}},{ledger:{receivedCents:1,spentCents:0,balanceCents:1}},{ledger:{receivedCents:Number.MAX_SAFE_INTEGER,spentCents:0,balanceCents:Number.MAX_SAFE_INTEGER,rows:[]}}])assert.equal(ledger.combineDashboard({funds:[{initialAmount:1}],faculty}),null);
});
