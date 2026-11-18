'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const script=path.resolve('scripts/compare-faculty-rules.cjs');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pondo-rules-'));try{return fn(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
test('exact local copy reports hashes, byte matches, and its limited evidentiary value',()=>fixture(dir=>{
 const file=path.join(dir,'copy with spaces.rules');fs.copyFileSync('firestore.faculty-test.rules',file);const before=fs.readFileSync(file),r=run(file);
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/OFFLINE TEXT COMPARISON ONLY/);assert.match(r.stdout,/not verified as the currently published rules/);assert.match(r.stdout,/Repository test rules .*EXACT BYTE MATCH/);assert.match(r.stdout,/Undeployed release candidate .*DIFFERENT/);assert.match(r.stdout,/matches its test-rules generator: YES/);assert.match(r.stdout,/do not establish effective permissions/);assert.ok(fs.readFileSync(file).equals(before));
}));
test('full local diff shows ordinary workspace differences as well as the candidate change',()=>fixture(dir=>{
 const file=path.join(dir,'--published.rules');fs.writeFileSync(file,"rules_version = '2';\n// changed existing workspace rule\n");const r=run(file,'--diff');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/-\/\/ changed existing workspace rule/);assert.match(r.stdout,/facultyFundRelease/);assert.match(r.stdout,/may contain full rules/);assert.equal(fs.readFileSync(file,'utf8'),"rules_version = '2';\n// changed existing workspace rule\n");
}));
test('a match to the candidate does not imply remote state or approval',()=>fixture(dir=>{
 const file=path.join(dir,'candidate.rules');fs.copyFileSync('firestore.faculty-recovery-candidate.rules',file);const r=run(file,'--diff');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Undeployed recovery candidate .*EXACT BYTE MATCH/);assert.match(r.stdout,/no byte differences/);assert.match(r.stdout,/Do not deploy/);
}));
test('missing, malformed, oversized or unknown arguments fail without a comparison report',()=>fixture(dir=>{
 for(const args of [[],[path.join(dir,'missing')],['--diff'],['firestore.rules','--bad']]){const r=run(...args);assert.equal(r.status,2);assert.match(r.stderr,/Comparison failed/);assert.equal(r.stdout,'');}
 const file=path.join(dir,'bad');for(const data of [Buffer.alloc(0),Buffer.from([0xff]),Buffer.from('abc\0'),Buffer.alloc(2*1024*1024+1,65)]){fs.writeFileSync(file,data);const r=run(file);assert.equal(r.status,2);assert.equal(r.stdout,'');}
}));
