'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSparkReadAdapter}=require('../faculty-fund-spark-read-adapter.js');
test('Spark history preserves links to original handover, member receipt and assigned president',async()=>{
 const now=new Date('2026-11-09T12:00:00Z');
 const records={people:[],payments:[],slots:[],remittances:[],lines:[],wallets:[],expenses:[],allocations:[],corrections:[{id:'correction-1',remittanceId:'handover-1',requestedBy:'ao',requestedAt:now,reason:'Wrong batch',status:'approved',decidedBy:'president',decidedAt:now}],presidentHistory:[{id:'assignment-1',assignedBy:'owner',assignedAt:now,presidentUid:'president'}],memberReceipts:[{id:'handover-1~payment-1',remittanceId:'handover-1',paymentId:'payment-1',printedAt:now,printedBy:'ao'}],remittanceReceipts:[]};
 const context={orgId:'school',uid:'ao',role:'disbursing',memberConfirmed:true,scopeToken:1,members:[]};
 const adapter=createSparkReadAdapter({getContext:()=>context,makeReader:()=>({read:async()=>({records,config:null,revision:1,projection:{pendingWork:[],rows:[]}})}),makeReceipts:()=>{},makeReport:()=>{},reportCsv:()=>{},makeExport:()=>{}});
 const result=await adapter.read({orgId:'school',view:'state'}),audit=result.state.audit;
 assert.equal(audit.find(x=>x.kind==='remittance-void-requested').entityId,'handover-1');assert.equal(audit.find(x=>x.kind==='remittance-void-approved').entityId,'handover-1');assert.equal(audit.find(x=>x.kind==='member-receipt-marked-printed').entityId,'payment-1');assert.equal(audit.find(x=>x.kind==='president-assigned').presidentUid,'president');
});
