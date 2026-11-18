'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeSparkDiagnosticExport,verifySparkDiagnosticExport,cleanSparkDiagnosticValue}=require('../faculty-fund-spark-export.js');
const {verifySparkDiagnostic}=require('../faculty-fund-spark-verify.js'),{projectFacultySpark}=require('../faculty-fund-spark-projection.js'),{planFacultySparkCapture}=require('../faculty-fund-spark-capture.js');
const {makeFacultyRecoveryReference,inspectFacultyRecoveryReference}=require('../faculty-fund-spark-backup-file.js');
const names=['people','payments','slots','remittances','lines','wallets','expenses','allocations','corrections','presidentHistory','memberReceipts','remittanceReceipts'];
const deps={orgId:'school',verifyChecksum:verifySparkDiagnosticExport,verifyDiagnostic:verifySparkDiagnostic,project:projectFacultySpark,plan:planFacultySparkCapture,encode:cleanSparkDiagnosticValue};
async function diagnostic(){const records=Object.fromEntries(names.map(n=>[n,[]]));records.people=[{id:'p',name:'Ana'}];return makeSparkDiagnosticExport({revision:5,config:null,records,projection:projectFacultySpark({confirmed:true,...records})},{orgId:'school',actorUid:'owner',role:'owner'});}
const capture={backupId:'abcdefghijklmnop',revision:5,count:1,status:'copies-created-not-restorable'};
test('recovery reference contains checked data and warns it needs its server copies',async()=>{const file=await makeFacultyRecoveryReference({...deps,capture,diagnostic:await diagnostic()}),result=await inspectFacultyRecoveryReference({...deps,value:JSON.parse(JSON.stringify(file))});assert.equal(result.backupId,capture.backupId);assert.deepEqual(result.expected.manifest,['sparkDiscoveryPeople/p']);assert.match(result.notice,/matching server recovery point/);assert.match(result.notice,/cannot restore a deleted Firebase project/);});
test('rejects wrong workspace, damaged copies and capture revisions or counts that differ',async()=>{
 const d=await diagnostic(),file=await makeFacultyRecoveryReference({...deps,capture,diagnostic:d});await assert.rejects(inspectFacultyRecoveryReference({...deps,orgId:'other',value:file}),/another workspace/);file.diagnostic.payload.records.people[0].name='Changed';await assert.rejects(inspectFacultyRecoveryReference({...deps,value:file}),/checksum/);
 for(const c of [{...capture,count:2},{...capture,revision:6},{...capture,status:'pending'}])await assert.rejects(makeFacultyRecoveryReference({...deps,capture:c,diagnostic:await diagnostic()}));
});
