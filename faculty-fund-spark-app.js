/* Experimental Faculty Fund wiring. Default mode requires a demo project;
 * real-account test mode explicitly restricts access to named test workspaces.
 * The reader loads full collections and is not quota-safe for a growing
 * workspace. Never use this for actual funds or production data. */
(function(global){
 'use strict';
 function createSparkApp({db,api,getContext,modules,realAccountTest=false,releasePreview=false}){
  const required=['createClient','createReader','project','createReadAdapter','createWriteAdapter','createReceipts','makeReport','reportCsv','makeExport','createPendingReader','createPendingInspector','createDiscovery','createResolver','createExpenseResumer','createPagedRecovery'];
  if(!db||!api||typeof getContext!=='function'||!modules||required.some(k=>typeof modules[k]!=='function'))throw Error('Faculty Fund test setup is incomplete');
  if(typeof realAccountTest!=='boolean'||typeof releasePreview!=='boolean'||realAccountTest&&releasePreview)throw Error('Invalid Faculty Fund mode');
  const project=db.app?.options?.projectId,demo=typeof project==='string'&&/^demo-[a-z0-9-]+$/.test(project);
  if(realAccountTest ? project!=='russapps-pondo' : releasePreview ? !(demo||project==='russapps-pondo') : !demo)throw Error('Faculty Fund test mode requires a demo Firebase project or the explicitly configured real-account test project');
  if(releasePreview&&(typeof api.doc!=='function'||typeof api.getDocFromServer!=='function'))throw Error('Faculty Fund release preview requires server-only access');
  let scope=0;
  function context(){const c=getContext();if(realAccountTest&&(!c||typeof c.orgId!=='string'||!/^org~faculty fund test .+/.test(c.orgId)))return null;return c?{...c,scopeToken:scope}:null;}
  function sameScope(c){const n=context();return !!n&&n.memberConfirmed===true&&n.orgId===c.orgId&&n.uid===c.uid&&n.role===c.role&&n.scopeToken===c.scopeToken;}
  async function confirmRelease(orgId,expected){
   if(!releasePreview)return;
   const c=expected||context();if(!c||c.memberConfirmed!==true||typeof c.uid!=='string'||!c.uid||typeof c.orgId!=='string'||!c.orgId||c.orgId.includes('/')||c.orgId!==orgId||!['owner','disbursing','project-manager','reviewer'].includes(c.role)||!sameScope(c))throw Error('Open a confirmed team workspace');
   const snap=await api.getDocFromServer(api.doc(db,`organizations/${c.orgId}/facultyFundRelease/current`));
   if(!sameScope(c))throw Error('Workspace changed while checking Faculty Fund access');
   if(!snap?.metadata||snap.metadata.fromCache||snap.metadata.hasPendingWrites||!snap.exists()||snap.data()?.enabled!==true||snap.data()?.schema!==1)throw Error('Faculty Fund is not enabled for this workspace');
  }
  const makeClient=c=>modules.createClient({db,api,orgId:c.orgId,uid:c.uid,useRevision:true,trackRemittanceReleases:true});
  const makeReader=(c,isCurrent)=>modules.createReader({db,api,orgId:c.orgId,isCurrent,project:modules.project,trackRemittanceReleases:true});
  const read=modules.createReadAdapter({getContext:context,makeReader,makeReceipts:modules.createReceipts,makeReport:modules.makeReport,reportCsv:modules.reportCsv,makeExport:modules.makeExport});
  const write=modules.createWriteAdapter({getContext:context,makeClient,makeReader});
  const pending=modules.createPendingInspector({getContext:context,makeReader:(c,isCurrent)=>modules.createPendingReader({db,api,orgId:c.orgId,isCurrent,trackRemittanceReleases:true})});
  function createRecovery(){
   const makeResolver=()=>modules.createResolver({getContext:context,makeDb:()=>db,api,makeClient,makeExpenseResumer:()=>modules.createExpenseResumer({getContext:context,makeDb:()=>db,api,makeClient})});
   const c=context(),inner=modules.createPagedRecovery({getContext:context,makeDb:()=>db,api,makeDiscovery:(c,isCurrent,pageSize)=>modules.createDiscovery({db,api,orgId:c.orgId,isCurrent,pageSize}),makeResolver,supportsExpenseResume:true});
   if(!releasePreview)return inner;let generation=0;
   const call=async(method,input)=>{const g=generation;await confirmRelease(input?.orgId,c);if(g!==generation)throw Error('Workspace changed while checking Faculty Fund access');return inner[method](input);};
   return {list:input=>call('list',input),resolve:input=>call('resolve',input),reset:()=>{generation++;inner.reset();}};
  }
  function createActivity({orgId,from,to}){
   const c=context();if(!c||c.memberConfirmed!==true||!c.uid||!c.role||c.orgId!==orgId||typeof modules.createActivityPager!=='function')throw Error('Open an authorized test workspace');
   const same=()=>{const n=context();return !!n&&n.memberConfirmed===true&&n.uid===c.uid&&n.orgId===c.orgId&&n.role===c.role&&n.scopeToken===c.scopeToken;};
   const inner=modules.createActivityPager({db,api,orgId:c.orgId,isCurrent:same,from,to,pageSize:25});if(!releasePreview)return inner;let generation=0;
   return {next:async kind=>{const g=generation;await confirmRelease(c.orgId,c);if(g!==generation)throw Error('Workspace changed while checking Faculty Fund access');return inner.next(kind);},reset:()=>{generation++;inner.reset();}};
  }
  async function safeRead(input){await confirmRelease(input?.orgId);const result=await read.read(input);if((realAccountTest||releasePreview)&&result?.html)result.html=result.html.replaceAll('Faculty Fund · Special Collection','TEST ONLY — NOT A REAL RECEIPT · Faculty Fund');if((realAccountTest||releasePreview)&&result?.csv)result.csv='"TEST ONLY — NOT A REAL FINANCIAL REPORT"\r\n'+result.csv.replace(/^\ufeff/,'');return result;}
  async function diagnosticExport(input){
   if(typeof read.export!=='function')throw Error('Faculty Fund diagnostic export is unavailable');
   await confirmRelease(input?.orgId);const result=await read.export(input);
   return {...result,notice:'TEST ONLY — diagnostic copy; not an authenticated backup or a restore file.'};
  }
  async function transition(input){await confirmRelease(input?.orgId);return write.transition(input);}
  async function inspectPending(input){await confirmRelease(input?.orgId);return pending.inspect(input);}
  return {read:safeRead,export:diagnosticExport,transition,inspectPending,createRecovery,createActivity,getRecoveryContext:context,resetScope:()=>{scope++;},capabilities:{durableBackup:false,diagnosticExport:true,mode:releasePreview?'release-preview-only':realAccountTest?'firebase-test-only':'emulator-test-only'}};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkApp};else global.createFacultyFundSparkApp=createSparkApp;
})(typeof window!=='undefined'?window:globalThis);
