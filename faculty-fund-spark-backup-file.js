/* Experimental owner-held reference + data file. A matching immutable server
 * copy is still required to restore; this file alone cannot authorize financial
 * history or recover a deleted Firebase project. Not connected to the app. */
(function(global){
 'use strict';
 const format='pondo-faculty-recovery-reference-v1',fail=m=>{throw Error(m)};
 const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(x);
 async function inspect({value,orgId,verifyChecksum,verifyDiagnostic,project,plan,encode}){
  if(!value||value.format!==format||!validId(value.backupId)||!value.diagnostic||typeof orgId!=='string'||!orgId||[verifyChecksum,verifyDiagnostic,project,plan,encode].some(x=>typeof x!=='function'))fail('Invalid Faculty Fund recovery file');
  const r=await verifyDiagnostic({envelope:value.diagnostic,orgId,verifyChecksum,project}),payload=value.diagnostic.payload;
  const entries=plan({revision:payload.revision,records:payload.records,config:payload.config,projection:payload.summary}),manifest=entries.map(x=>x.kind+'/'+x.id).sort();
  if(r.revision!==payload.revision||new Set(manifest).size!==manifest.length)fail('Invalid Faculty Fund recovery file');
  return {backupId:value.backupId,expected:{revision:r.revision,manifest,payload,encode},notice:'Contains sensitive records. This file needs its matching server recovery point. It cannot restore a deleted Firebase project or recover later changes; it is rejected if the fund changed after the backup.'};
 }
 async function make({diagnostic,capture,orgId,verifyChecksum,verifyDiagnostic,project,plan,encode}){
  if(!capture||capture.status!=='copies-created-not-restorable'||!validId(capture.backupId))fail('A completed experimental capture is required');
  const value={format,backupId:capture.backupId,diagnostic},checked=await inspect({value,orgId,verifyChecksum,verifyDiagnostic,project,plan,encode});
  if(capture.revision!==checked.expected.revision||capture.count!==checked.expected.manifest.length)fail('Faculty Fund changed while preparing the recovery file');
  return value;
 }
 if(typeof module==='object'&&module.exports)module.exports={makeFacultyRecoveryReference:make,inspectFacultyRecoveryReference:inspect};else global.FacultySparkBackupFile={make,inspect};
})(typeof window!=='undefined'?window:globalThis);
