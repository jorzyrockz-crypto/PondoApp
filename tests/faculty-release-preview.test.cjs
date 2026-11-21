'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createSparkApp}=require('../faculty-fund-spark-app.js');
function fixture(){
 let ctx={uid:'owner',role:'owner',orgId:'org~existing school',memberConfirmed:true},metadata={fromCache:false,hasPendingWrites:false},marker={enabled:true,schema:1},hook=async()=>{};const calls=[];
 const api={doc:(_db,p)=>p,getDocFromServer:async p=>{calls.push(p);await hook();return {metadata,exists:()=>marker!==null,data:()=>marker}}};
 const modules={createClient(){},createReader(){},project(){},createReadAdapter:()=>({read:async input=>input.view==='csv'?{csv:'amount'}:{html:'Faculty Fund · Special Collection'},export:async()=>({format:'diagnostic'})}),createWriteAdapter:()=>({transition:async()=>{calls.push('transition');return {ok:true}}}),createReceipts(){},makeReport(){},reportCsv(){},makeExport(){},createPendingReader(){},createPendingInspector:()=>({inspect:async()=>{calls.push('inspect');return {status:'pending'}}}),createDiscovery(){},createResolver(){},createExpenseResumer(){},createPagedRecovery:()=>({list:async()=>{calls.push('list');return {}},resolve:async()=>{calls.push('resolve');return {}},reset(){calls.push('recovery-reset')}}),createActivityPager:()=>({next:async()=>{calls.push('activity');return {}},reset(){calls.push('activity-reset')}})};
 const app=createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api,getContext:()=>ctx,modules,releasePreview:true});return {app,api,modules,calls,setCtx:c=>ctx=c,ctx:()=>ctx,setMarker:m=>marker=m,setMetadata:m=>metadata=m,setHook:h=>hook=h};
}
test('existing workspaces use a server-confirmed release control without removing test-only warnings',async()=>{
 const f=fixture(),orgId=f.ctx().orgId;assert.equal(f.app.capabilities.mode,'release-preview-only');assert.equal(f.app.capabilities.durableBackup,false);
 assert.match((await f.app.read({orgId,view:'memberReceipts'})).html,/TEST ONLY/);assert.match((await f.app.read({orgId,view:'csv'})).csv,/TEST ONLY/);assert.match((await f.app.export({orgId})).notice,/not an authenticated backup/);await f.app.transition({orgId});await f.app.inspectPending({orgId});
 const activity=f.app.createActivity({orgId,from:'2025-01-01',to:'2025-01-01'});await activity.next('payments');const recovery=f.app.createRecovery();await recovery.list({orgId});await recovery.resolve({orgId});
 assert.equal(f.calls.filter(x=>x==='organizations/'+orgId+'/facultyFundRelease/current').length,8);assert.ok(f.calls.includes('activity'));assert.ok(f.calls.includes('resolve'));
});
test('missing, disabled, wrong-version, cached and pending controls fail closed before actions',async()=>{
 const f=fixture(),orgId=f.ctx().orgId;for(const bad of [null,{enabled:false,schema:1},{enabled:true,schema:2},{enabled:1,schema:1}]){f.setMarker(bad);await assert.rejects(f.app.transition({orgId}),/not enabled/);}
 f.setMarker({enabled:true,schema:1});for(const metadata of [{fromCache:true,hasPendingWrites:false},{fromCache:false,hasPendingWrites:true},null]){f.setMetadata(metadata);await assert.rejects(f.app.transition({orgId}),/not enabled/);}
 assert.equal(f.calls.includes('transition'),false);f.setMetadata({fromCache:false,hasPendingWrites:false});await assert.rejects(f.app.read({orgId:'org~other',view:'state'}),/confirmed team workspace/);assert.equal(f.calls.some(x=>x.includes('org~other')),false);
});
test('scope changes and pager resets invalidate checks in flight',async()=>{
 const f=fixture(),orgId=f.ctx().orgId;let resume,ready;const started=()=>new Promise(r=>ready=r);let begun=started();f.setHook(()=>{ready();return new Promise(r=>resume=r)});const write=f.app.transition({orgId});await begun;f.setCtx({...f.ctx(),uid:'another'});resume();await assert.rejects(write,/Workspace changed/);assert.equal(f.calls.includes('transition'),false);
 f.setCtx({...f.ctx(),uid:'owner'});begun=started();const activity=f.app.createActivity({orgId,from:'2025-01-01',to:'2025-01-01'}),next=activity.next('payments');await begun;activity.reset();resume();await assert.rejects(next,/Workspace changed/);assert.equal(f.calls.includes('activity'),false);
 begun=started();const recovery=f.app.createRecovery(),list=recovery.list({orgId});await begun;recovery.reset();resume();await assert.rejects(list,/Workspace changed/);assert.equal(f.calls.includes('list'),false);
});
test('archived preview is not loaded by the shipped app and restricts projects',()=>{
 const f=fixture(),html=fs.readFileSync('index.html','utf8');assert.doesNotMatch(html,/FACULTY_FUND_RELEASE_PREVIEW|createFacultyFundSparkApp/);
 assert.throws(()=>createSparkApp({db:{app:{options:{projectId:'some-other-project'}}},api:f.api,getContext:f.ctx,modules:f.modules,releasePreview:true}),/test mode/);
});

test('existing test workspace and ordinary workspace can coexist with their own scoped gates',async()=>{
 const f=fixture();const app=createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api:f.api,getContext:f.ctx,modules:f.modules,realAccountTest:true,releasePreview:true});
 f.setCtx({...f.ctx(),orgId:'org~faculty fund test old'});assert.equal(app.capabilities.mode,'firebase-test-only');await app.transition({orgId:f.ctx().orgId});assert.equal(f.calls.filter(x=>x.includes('facultyFundRelease')).length,0);assert.match((await app.read({orgId:f.ctx().orgId,view:'memberReceipts'})).html,/TEST ONLY/);
 f.setCtx({...f.ctx(),orgId:'org~faculty fund test'});assert.equal(app.capabilities.mode,'firebase-test-only');await app.transition({orgId:f.ctx().orgId});assert.equal(f.calls.filter(x=>x.includes('facultyFundRelease')).length,0);
 f.setCtx({...f.ctx(),orgId:'org~ordinary school'});assert.equal(app.capabilities.mode,'release-preview-only');f.setMarker(null);await assert.rejects(app.transition({orgId:f.ctx().orgId}),/not enabled/);f.setMarker({enabled:true,schema:1});await app.transition({orgId:f.ctx().orgId});assert.equal(f.calls.filter(x=>x.includes('org~ordinary school/facultyFundRelease')).length,2);
});
test('local diagnostic checking is scoped to the confirmed owner and cancels on workspace reset',async()=>{
 const f=fixture(),orgId=f.ctx().orgId;let resume,started;const ready=new Promise(r=>started=r);
 f.modules.verifyExport=async()=>true;f.modules.verifyDiagnostic=async({orgId:scope})=>{assert.equal(scope,orgId);started();await new Promise(r=>resume=r);return {notice:'not authenticated'}};
 const app=createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api:f.api,getContext:f.ctx,modules:f.modules,releasePreview:true});assert.equal(app.capabilities.diagnosticVerify,true);
 f.setCtx({...f.ctx(),role:'reviewer'});await assert.rejects(app.verifyDiagnostic({orgId,content:'{}'}),/unavailable/);
 f.setCtx({...f.ctx(),role:'owner',memberConfirmed:false});await assert.rejects(app.verifyDiagnostic({orgId,content:'{}'}),/unavailable/);
 f.setCtx({...f.ctx(),memberConfirmed:true});await assert.rejects(app.verifyDiagnostic({orgId:'other',content:'{}'}),/unavailable/);await assert.rejects(app.verifyDiagnostic({orgId,content:'{'}),/valid Faculty Fund diagnostic/);
 const checking=app.verifyDiagnostic({orgId,content:'{}'});await ready;app.resetScope();resume();await assert.rejects(checking,/Workspace changed/);assert.equal(f.calls.length,0);
});
test('experimental owner recovery requires release preview on the real project',()=>{
 const f=fixture(),html=fs.readFileSync('index.html','utf8');assert.doesNotMatch(html,/FACULTY_FUND_RESTORE_DEMO/);assert.equal(f.app.capabilities.experimentalOwnerRecovery,false);assert.throws(()=>createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api:f.api,getContext:f.ctx,modules:f.modules,realAccountTest:true,experimentalRestore:true}),/requires a demo project or the disabled release preview/);
});
test('demo-only owner recovery wiring is opt-in and requests a guarded normal reader',async()=>{
 const f=fixture(),calls=[];Object.assign(f.modules,{createCapture:({makeReader})=>({capture:async()=>{makeReader(f.ctx(),()=>true);return {}}}),createRestore:({makeReader})=>({restore:async()=>{makeReader(f.ctx(),()=>true);return {}}}),createOwnerRecovery:({capture,restore})=>({download:capture,importFile:restore,abandonCapture(){}}),makeRecoveryFile(){},inspectRecoveryFile(){},verifyDiagnostic(){},verifyExport(){},planCapture(){},canonicalCapture(){},encodeCapture(){},createReader:opts=>{calls.push(opts);return {}}});
 const app=createSparkApp({db:{app:{options:{projectId:'demo-recovery'}}},api:f.api,getContext:f.ctx,modules:f.modules,experimentalRestore:true});assert.equal(app.capabilities.experimentalOwnerRecovery,true);await app.downloadRecovery({orgId:f.ctx().orgId});await app.restoreRecovery({orgId:f.ctx().orgId});assert.equal(calls[0].checkRestoreLock,true);assert.equal(calls[1].checkRestoreLock,false);
});
test('demo recovery lock blocks transitions, inspection and activity until server confirms it is absent',async()=>{
 const f=fixture(),calls=[];Object.assign(f.modules,{createCapture:()=>({capture(){}}),createRestore:()=>({restore(){}}),createOwnerRecovery:()=>({download(){},importFile(){},abandonCapture(){}}),makeRecoveryFile(){},inspectRecoveryFile(){},verifyDiagnostic(){},verifyExport(){},planCapture(){},canonicalCapture(){},encodeCapture(){},createWriteAdapter:()=>({transition:async()=>{calls.push('transition');return {ok:true}}}),createPendingInspector:()=>({inspect:async()=>{calls.push('inspect');return {}}}),createActivityPager:()=>({next:async()=>{calls.push('activity');return {}},reset(){}})});
 const app=createSparkApp({db:{app:{options:{projectId:'demo-recovery'}}},api:f.api,getContext:f.ctx,modules:f.modules,experimentalRestore:true}),orgId=f.ctx().orgId;f.setMarker({active:true});await assert.rejects(app.transition({orgId}),/restore is in progress/);await assert.rejects(app.inspectPending({orgId}),/restore is in progress/);await assert.rejects(app.createActivity({orgId}).next('payments'),/restore is in progress/);assert.deepEqual(calls,[]);
 f.setMarker(null);await app.transition({orgId});await app.inspectPending({orgId});await app.createActivity({orgId}).next('payments');assert.deepEqual(calls,['transition','inspect','activity']);
 f.setMetadata({fromCache:true,hasPendingWrites:false});await assert.rejects(app.transition({orgId}),/not server-confirmed/);
});
test('existing-workspace recovery preview requires the server release marker',async()=>{
 const f=fixture(),calls=[];Object.assign(f.modules,{createCapture:()=>({capture(){}}),createRestore:()=>({restore(){}}),createOwnerRecovery:()=>({download:async()=>{calls.push('backup');return {}},importFile:async()=>{calls.push('restore');return {}},abandonCapture(){}}),makeRecoveryFile(){},inspectRecoveryFile(){},verifyDiagnostic(){},verifyExport(){},planCapture(){},canonicalCapture(){},encodeCapture(){}});
 const html=fs.readFileSync('index.html','utf8');assert.doesNotMatch(html,/FACULTY_FUND_RECOVERY_PREVIEW/);const app=createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api:f.api,getContext:f.ctx,modules:f.modules,realAccountTest:true,releasePreview:true,experimentalRestore:true}),orgId=f.ctx().orgId;assert.equal(app.capabilities.mode,'release-preview-only');f.setMarker(null);await assert.rejects(app.downloadRecovery({orgId}),/not enabled/);await assert.rejects(app.restoreRecovery({orgId,content:'{}'}),/not enabled/);assert.deepEqual(calls,[]);f.setMarker({enabled:true,schema:1});await app.downloadRecovery({orgId});await app.restoreRecovery({orgId,content:'{}'});assert.deepEqual(calls,['backup','restore']);
});
