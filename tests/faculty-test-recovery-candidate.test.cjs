'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {generate}=require('../scripts/generate-faculty-test-recovery-candidate.cjs');
test('test-only recovery review candidate preserves configured rules and scopes faculty access',()=>{
 const candidate=fs.readFileSync('firestore.faculty-test-recovery-candidate.rules','utf8'),normal=fs.readFileSync('firestore.rules','utf8');
 assert.equal(candidate,generate());
 // The original Pondo rule body is unchanged; only the warning header and
 // additional test-only paths follow it. No Firebase configuration is changed.
 const body=normal.slice(normal.indexOf('// Firestore Security Rules for Pondo.'),-6);
 assert.ok(candidate.includes(body));
 assert.match(candidate,/o\.matches\('\^org~faculty fund test \.\+\$'\)/);
 assert.match(candidate,/o == 'org~faculty fund test'/);
 assert.doesNotMatch(candidate,/facultyFundRelease/);
 assert.match(candidate,/function signed\(o\) \{ return recoveryMember\(o\) && !exists\(lock\(o\)\);/);
 assert.match(candidate,/TEST-WORKSPACE RECOVERY REVIEW CANDIDATE/);
 assert.equal(JSON.parse(fs.readFileSync('firebase.json','utf8')).firestore.rules,'firestore.rules');
});
