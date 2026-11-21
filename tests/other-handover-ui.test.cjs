'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('register displays server-confirmed handovers without claiming stale or unavailable records',()=>{
 const overlay={addEventListener(){}},status={textContent:''},document={getElementById:id=>id==='otherHandoverOverlay'?overlay:id==='otherHandoverStatus'?status:null};
 const payment={id:'p',amount:50},state={orgId:'team',uid:'a',memberConfirmed:true,baselineReady:true,online:true},ctx={document,navigator:{onLine:true},otherPayments:[payment]};ctx.window=ctx;ctx.pondoTeamState=state;ctx.pondoCurrentUser={uid:'a'};vm.runInNewContext(fs.readFileSync('other-fund-handover-ui.js','utf8'),ctx);
 ctx.otherHandoverSetView({org:'team',uid:'a',status:'ready',items:[],more:false});assert.equal(ctx.otherHandoverStatus(payment),'Not handed over');
 for(const [status,expected] of [['pending','Pending confirmation'],['declined','Declined'],['confirmed','Handed over']]){ctx.otherHandoverSetView({org:'team',uid:'a',status:'ready',items:[{id:'p',payment,status}],more:false});assert.equal(ctx.otherHandoverStatus(payment),expected);assert.equal(ctx.otherHandoverCanEditPayment('p'),status==='declined');}
 assert.equal(ctx.otherHandoverStatus({...payment,amount:51}),'Handed over · payment changed');state.online=false;assert.equal(ctx.otherHandoverStatus(payment),'Unavailable');assert.equal(ctx.otherHandoverCanEditPayment('p'),false);
});
test('handover entries are separate no-cash records in Transactions',()=>{
 const ledger=require('../unified-ledger.js'),payment={id:'p',paidBy:'Teacher',purpose:'Leave',amount:50,date:'2026-01-01',receivedBy:'Alice'};
 const handover={id:'p',attempt:0,payment,sender:'Alice',receiver:'Bob',initiator:'Alice',date:'2026-01-02',status:'pending'};
 const rows=ledger.build({otherPayments:[payment],handovers:[handover]});assert.equal(rows.length,2);const event=rows.find(r=>r.source==='handover');assert.equal(event.status,'Pending confirmation');assert.equal(event.impact,'NONE');assert.equal(event.handoverId,'p');assert.equal(ledger.totals(rows).TRACKING,5000);assert.equal(ledger.totals(rows).IN,0);
});
