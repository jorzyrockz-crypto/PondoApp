const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('function buildRefundTransparencyRows('),html.indexOf('function renderRefundTransparency()'));
const ctx=vm.createContext({cents:v=>Math.round((Number(v)||0)*100),payableOutstanding:b=>b.outstanding??10000,payablePaid:b=>b==='paid'?100:0,payableCredit:()=>0});vm.runInContext(code,ctx);
const b=(id,extra={})=>({id,kind:'advance',createdBy:{uid:'a',name:'Ana'},reimburseToUid:'a',reimburseTo:'Ana',amount:100,invoiceDate:'2026-01-01',...extra});
const build=(bills=[],tx=[],audit=[],member=[])=>ctx.buildRefundTransparencyRows(bills,tx,audit,member);
test('identity flags use UID, not matching display names, and do not mark unlinked records safe',()=>{
 const rows=build([b('self'),b('other',{reimburseToUid:'b',reimburseTo:'Ana'}),b('legacy',{reimburseToUid:undefined})]);
 assert.equal(rows.find(x=>x.id==='self').requesterIsRecipient,true);assert.equal(rows.find(x=>x.id==='other').requesterIsRecipient,false);assert.equal(rows.find(x=>x.id==='legacy').payeeUid,null);assert.equal(rows.find(x=>x.id==='legacy').requesterIsRecipient,false);
});
test('payment recorder flag includes active and later-voided payments without double counting',()=>{
 const bill=b('r',{reimburseToUid:'b'}),tx={id:'t',type:'OUT',payableId:'r',createdBy:{uid:'b',name:'B'},amount:40,date:'2026-01-02',method:'Cash',receiptNo:'X'};
 let [row]=build([bill],[tx]);assert.equal(row.requesterIsRecipient,false);assert.equal(row.recorderIsRecipient,true);assert.equal(row.events[0].label,'Payment recorded');
 [row]=build([bill],[],[{action:'void transaction',timestamp:'2026-01-03',record:tx,reason:'wrong',by:{uid:'a'}}]);assert.equal(row.recorderIsRecipient,true);assert.equal(row.events[0].label,'Payment voided');assert.equal(row.events.length,1);assert.equal(row.events[0].reason,'wrong');
});
test('unconfirmed inbox and ledger identity conflicts cannot produce flags or payment details',()=>{
 const [row]=build([b('r')],[{type:'OUT',payableId:'r',createdBy:{uid:'a'}}],[],[{id:'r',uid:'other',status:'approved',reimburseToUid:'a'}]);assert.equal(row.conflict,true);assert.equal(row.requesterIsRecipient,false);assert.equal(row.recorderIsRecipient,false);assert.equal(row.events.length,0);assert.equal(row.status,'Details awaiting confirmation');
});
test('pending inbox and voided ledger records are represented without fabricating payments',()=>{
 const rows=build([],[],[{action:'void payable',record:b('v'),reason:'Cancelled'}],[{id:'p',uid:'m',status:'pending',reimburseToUid:'m',amountCents:100}]);assert.equal(rows.find(x=>x.id==='p').requesterIsRecipient,true);assert.equal(rows.find(x=>x.id==='p').status,'Pending review');assert.equal(rows.find(x=>x.id==='v').status,'Voided');assert.equal(rows.find(x=>x.id==='v').requesterIsRecipient,true);
});
test('all bundled rule variants support optional member ID while retaining legacy request shape',()=>{
 for(const f of ['firestore.rules']){const rules=fs.readFileSync(f,'utf8');assert.match(rules,/exists\(memberPath\(orgId, request\.resource\.data\.reimburseToUid\)\)/);assert.match(rules,/!\('reimburseToUid' in request\.resource\.data\)/);}
});
test('inbox and ledger status changes wait for the two listeners to agree',()=>{
 const bill=b('x');const [row]=build([bill],[],[],[{id:'x',uid:'a',status:'pending',reimburseToUid:'a'}]);assert.equal(row.conflict,true);assert.equal(row.status,'Details awaiting confirmation');assert.equal(row.requesterIsRecipient,false);
});
