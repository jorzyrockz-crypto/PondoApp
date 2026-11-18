/* Pondo Faculty Fund wiring for a DEMO Firestore project only.
 * This is disabled in the shipped app. Production rules do not allow its
 * writes. The reader still loads full collections and is not quota-safe for
 * a growing workspace. Never use it for actual funds or production data. */
(function(global){
 'use strict';
 function createSparkApp({db,api,getContext,modules}){
  const required=['createClient','createReader','project','createReadAdapter','createWriteAdapter','createReceipts','makeReport','reportCsv','makeExport','createPendingReader','createPendingInspector','createDiscovery','createResolver','createExpenseResumer','createPagedRecovery'];
  if(!db||!api||typeof getContext!=='function'||!modules||required.some(k=>typeof modules[k]!=='function'))throw Error('Faculty Fund test setup is incomplete');
  const project=db.app?.options?.projectId;if(typeof project!=='string'||!/^demo-[a-z0-9-]+$/.test(project))throw Error('Faculty Fund test mode requires a demo Firebase project');
  let scope=0;
  function context(){const c=getContext();return c?{...c,scopeToken:scope}:null;}
  const makeClient=c=>modules.createClient({db,api,orgId:c.orgId,uid:c.uid,useRevision:true,trackRemittanceReleases:true});
  const makeReader=(c,isCurrent)=>modules.createReader({db,api,orgId:c.orgId,isCurrent,project:modules.project,trackRemittanceReleases:true});
  const read=modules.createReadAdapter({getContext:context,makeReader,makeReceipts:modules.createReceipts,makeReport:modules.makeReport,reportCsv:modules.reportCsv,makeExport:modules.makeExport});
  const write=modules.createWriteAdapter({getContext:context,makeClient,makeReader});
  const pending=modules.createPendingInspector({getContext:context,makeReader:(c,isCurrent)=>modules.createPendingReader({db,api,orgId:c.orgId,isCurrent,trackRemittanceReleases:true})});
  function createRecovery(){
   const makeResolver=()=>modules.createResolver({getContext:context,makeDb:()=>db,api,makeClient,makeExpenseResumer:()=>modules.createExpenseResumer({getContext:context,makeDb:()=>db,api,makeClient})});
   return modules.createPagedRecovery({getContext:context,makeDb:()=>db,api,makeDiscovery:(c,isCurrent,pageSize)=>modules.createDiscovery({db,api,orgId:c.orgId,isCurrent,pageSize}),makeResolver,supportsExpenseResume:true});
  }
  return {read:read.read,transition:write.transition,inspectPending:pending.inspect,createRecovery,getRecoveryContext:context,resetScope:()=>{scope++;},capabilities:{durableBackup:false,mode:'emulator-test-only'}};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkApp};else global.createFacultyFundSparkApp=createSparkApp;
})(typeof window!=='undefined'?window:globalThis);
