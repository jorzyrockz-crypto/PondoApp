'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
test('experimental Faculty deletion rule fixtures match their guarded sources',()=>{
 const result=spawnSync(process.execPath,['experiments/spark-workspace-delete/generate-faculty-candidate.cjs','--check'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
