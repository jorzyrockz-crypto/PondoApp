'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{generate}=require('../scripts/generate-faculty-recovery-candidate.cjs');
test('owner recovery candidate is reproducible, opt-in, and never the configured rules',()=>{
 const candidate=fs.readFileSync('firestore.faculty-recovery-candidate.rules','utf8'),firebase=JSON.parse(fs.readFileSync('firebase.json','utf8'));assert.equal(candidate,generate());assert.match(candidate,/OWNER RECOVERY REVIEW CANDIDATE/);assert.match(candidate,/function signed\(o\) \{ return recoveryMember\(o\) && !exists\(lock\(o\)\)/);assert.match(candidate,/sparkRestoreProof\/current/);assert.match(candidate,/facultyFundRelease\/current/);assert.notEqual(firebase.firestore.rules,'firestore.faculty-recovery-candidate.rules');assert.notEqual(fs.readFileSync('firestore.rules','utf8'),candidate);
});
