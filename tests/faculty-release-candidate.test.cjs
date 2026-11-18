'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {generate}=require('../scripts/generate-faculty-release-candidate.cjs');
test('release rules candidate is reproducible, explicitly gated and never the active Firebase rules',()=>{
 const testRules=fs.readFileSync('firestore.faculty-test.rules','utf8'),candidate=fs.readFileSync('firestore.faculty-release-candidate.rules','utf8'),firebase=JSON.parse(fs.readFileSync('firebase.json','utf8'));
 assert.equal(candidate,generate(testRules));assert.match(candidate,/RELEASE CANDIDATE FOR REVIEW ONLY/);assert.match(candidate,/facultyFundRelease\/current/);assert.match(candidate,/get\(facultyRelease\(o\)\)\.data\.enabled == true/);assert.match(candidate,/allow write: if false;/);assert.notEqual(firebase.firestore.rules,'firestore.faculty-release-candidate.rules');
 assert.match(testRules,/o\.matches\('\^org~faculty fund test \.\+\$'\)/);assert.throws(()=>generate(testRules.replace('    // TEST ONLY: experimental Faculty Fund; fictitious records only.','')),/insertion point/);
});
