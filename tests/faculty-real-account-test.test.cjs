'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createSparkApp}=require('../faculty-fund-spark-app.js');
function setup(projectId,realAccountTest){
 let ctx={orgId:'org~faculty fund test example',uid:'u',role:'owner',memberConfirmed:true};
 const modules={createClient(){},createReader(){},project(){},createReadAdapter:()=>({read:async input=>input.view==='csv'?{csv:'x,y'}:{html:'<p>Faculty Fund · Special Collection</p>'}}),createWriteAdapter:()=>({transition(){}}),createReceipts(){},makeReport(){},reportCsv(){},makeExport(){},createPendingReader(){},createPendingInspector:()=>({inspect(){}}),createDiscovery(){},createResolver(){},createExpenseResumer(){},createPagedRecovery(){}};
 const app=createSparkApp({db:{app:{options:{projectId}}},api:{},getContext:()=>ctx,modules,realAccountTest});return {app,ctx};
}
test('real-account test mode requires the project and gates scope to named test workspaces',async()=>{
 assert.throws(()=>setup('other',true),/wrong|demo Firebase/i);
 const {app,ctx}=setup('russapps-pondo',true);assert.equal(app.capabilities.mode,'firebase-test-only');assert.ok(app.getRecoveryContext());
 ctx.orgId='org~normal';assert.equal(app.getRecoveryContext(),null);ctx.orgId='org~faculty fund test';assert.equal(app.getRecoveryContext(),null);
 ctx.orgId='org~faculty fund test example';assert.match((await app.read({view:'memberReceipts'})).html,/TEST ONLY — NOT A REAL RECEIPT/);assert.match((await app.read({view:'csv'})).csv,/TEST ONLY/);
});
test('generated test rules keep existing rules and add only gated test collections',()=>{
 const normal=fs.readFileSync('firestore.rules','utf8'),testRules=fs.readFileSync('firestore.faculty-test.rules','utf8');
 assert.ok(testRules.startsWith(normal.slice(0,-6)));assert.match(testRules,/o\.matches\('\^org~faculty fund test \.\+\$'\)/);assert.match(testRules,/match \/facultyFund\/\{docId\}[\s\S]*?allow write: if false/);
});
test('paged activity requires the authorized scope and is invalidated on account or role change',()=>{
 let ctx={orgId:'org~faculty fund test example',uid:'u',role:'owner',memberConfirmed:true},opts;
 const modules={createClient(){},createReader(){},project(){},createReadAdapter:()=>({read(){}}),createWriteAdapter:()=>({transition(){}}),createReceipts(){},makeReport(){},reportCsv(){},makeExport(){},createPendingReader(){},createPendingInspector:()=>({inspect(){}}),createDiscovery(){},createResolver(){},createExpenseResumer(){},createPagedRecovery(){},createActivityPager:o=>(opts=o,{})};
 const app=createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api:{},getContext:()=>ctx,modules,realAccountTest:true});
 assert.throws(()=>app.createActivity({orgId:'org~other'}),/authorized/);app.createActivity({orgId:ctx.orgId,from:'2025-01-01',to:'2025-01-02'});assert.equal(opts.pageSize,25);assert.equal(opts.isCurrent(),true);
 ctx={...ctx,role:'viewer'};assert.equal(opts.isCurrent(),false);ctx={...ctx,role:'owner'};app.resetScope();assert.equal(opts.isCurrent(),false);ctx={...ctx,orgId:'org~other'};assert.throws(()=>app.createActivity({orgId:ctx.orgId}),/authorized/);
});
test('test diagnostic export requires the scoped owner, and a scope change cancels it',async()=>{
 const {createSparkReadAdapter}=require('../faculty-fund-spark-read-adapter.js');let ctx={orgId:'org~faculty fund test demo',uid:'u',role:'owner',memberConfirmed:true},resume,wait=false;
 const modules={createClient(){},createReader:({isCurrent})=>({read:async()=>{if(wait)await new Promise(r=>resume=r);if(!isCurrent())throw Error('Workspace changed');return {revision:1,records:{},projection:{}}}}),project(){},createReadAdapter:createSparkReadAdapter,createWriteAdapter:()=>({transition(){}}),createReceipts(){},makeReport(){},reportCsv(){},makeExport:async(s,c)=>({format:'diagnostic',orgId:c.orgId,revision:s.revision}),createPendingReader(){},createPendingInspector:()=>({inspect(){}}),createDiscovery(){},createResolver(){},createExpenseResumer(){},createPagedRecovery(){}};
 const app=createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api:{},getContext:()=>ctx,modules,realAccountTest:true});const id=ctx.orgId;
 const output=await app.export({orgId:id});assert.equal(output.orgId,id);assert.match(output.notice,/TEST ONLY/);assert.match(output.notice,/not an authenticated backup/);assert.equal(app.capabilities.durableBackup,false);
 ctx.role='reviewer';await assert.rejects(app.export({orgId:id}),/owner/);ctx.role='owner';ctx.orgId='org~normal';await assert.rejects(app.export({orgId:id}),/confirmed team workspace/);
 ctx.orgId=id;wait=true;const pending=app.export({orgId:id});await new Promise(resolve=>setImmediate(resolve));app.resetScope();resume();await assert.rejects(pending,/Workspace changed/);
});
