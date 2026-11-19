const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function buildMyRefundRows('),html.indexOf('function renderMyRefunds()'));
const ctx=vm.createContext({cents:v=>Math.round((Number(v)||0)*100)});vm.runInContext(source,ctx);
const build=(bills=[],tx=[],audit=[],items=[],uid='me')=>ctx.buildMyRefundRows(uid,bills,tx,audit,items);
const bill=(id,extra={})=>({id,kind:'advance',description:'Trip',amount:100,reimburseTo:'Another person',invoiceDate:'2026-01-01',createdBy:{uid:'me'},...extra});
test('links only the actual account UID and never free-text payee or another account',()=>{
 const rows=build([bill('mine'),bill('other',{createdBy:{uid:'other'},reimburseTo:'me'}),bill('old',{createdBy:{name:'me'}})]);
 assert.deepEqual(Array.from(rows,r=>r.id),['mine']);assert.equal(rows[0].payee,'Another person');assert.equal(rows[0].status,'Approved · awaiting payment');
});
test('partial, paid, non-cash settlement and voided payments derive from the existing ledger',()=>{
 const b=bill('r'),tx=[{id:'p',type:'OUT',payableId:'r',amount:40,date:'2026-01-02',method:'Cash',receiptNo:'Ref',payee:'Another person'}];
 let [row]=build([b],tx);assert.equal(row.status,'Partially paid');assert.equal(row.paid,4000);assert.equal(row.outstanding,6000);assert.match(row.events[0].detail,/Cash.*Ref/);
 tx.push({id:'p2',type:'OUT',payableId:'r',amount:60,date:'2026-01-03'});[row]=build([b],tx);assert.equal(row.status,'Paid');assert.equal(row.outstanding,0);
 tx.pop();b.absenceCredits=[{id:'c',amount:60,absenceDate:'2026-01-05'}];[row]=build([b],tx);assert.equal(row.status,'Settled');assert.equal(row.paid,4000);assert.equal(row.credit,6000);
 b.absenceCredits=[];[row]=build([b],[],[{action:'void transaction',timestamp:'2026-02-01',reason:'Reversed',record:{...tx[0]}}]);assert.equal(row.status,'Approved · awaiting payment');assert.equal(row.outstanding,10000);assert.equal(row.events[0].label,'Payment voided');assert.match(row.events[0].detail,/Reversed/);
 [row]=build([b],[],[{action:'bulk clear transaction',timestamp:'2026-02-01',record:{...tx[0]}}]);assert.equal(row.events[0].label,'Payment voided');
});
test('pending and rejected inbox entries merge once with ledger and closed audit records',()=>{
 const pending={id:'p',uid:'me',status:'pending',description:'Pending',amountCents:1000},rejected={id:'r',uid:'me',status:'rejected',description:'Rejected',amountCents:1200,decisionReason:'Duplicate'};
 const b=bill('a');const rows=build([b],[],[{action:'void payable',record:bill('v'),reason:'Cancelled'}],[pending,rejected,{id:'a',uid:'me',status:'approved',amountCents:10000},{id:'else',uid:'other',status:'pending'}]);
 assert.equal(rows.length,4);assert.equal(rows.find(r=>r.id==='p').status,'Pending review');assert.equal(rows.find(r=>r.id==='r').status,'Rejected');assert.equal(rows.find(r=>r.id==='v').status,'Voided');assert.equal(rows.find(r=>r.id==='a').status,'Approved · awaiting payment');
});
test('approved missing or conflicting ledger data never invents a payment or leaks an unrelated one',()=>{
 let [row]=build([],[],[],[{id:'r',uid:'me',status:'approved',amountCents:1000}]);assert.equal(row.status,'Approved · details unavailable');assert.equal(row.paid,null);
 [row]=build([bill('r',{createdBy:{uid:'other'}})],[{type:'OUT',payableId:'r',amount:10}],[],[{id:'r',uid:'me',status:'approved',amountCents:1000}]);assert.equal(row.conflict,true);assert.equal(row.paid,null);assert.equal(row.events.length,0);
 [row]=build([bill('r')],[{type:'OUT',payableId:'r',amount:10}],[],[{id:'r',uid:'me',status:'rejected',amountCents:1000}]);assert.equal(row.status,'Status awaiting confirmation');assert.equal(row.paid,null);assert.equal(row.events.length,0);
});

test('pending requests without a matching owned ledger record cannot inherit unrelated old payment events',()=>{
 const [row]=build([],[],[{action:'void transaction',record:{type:'OUT',payableId:'r',amount:99}}],[{id:'r',uid:'me',status:'pending',amountCents:500}]);assert.equal(row.events.length,0);assert.equal(row.status,'Pending review');
});
