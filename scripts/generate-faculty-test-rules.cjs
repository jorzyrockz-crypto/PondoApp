'use strict';
// Generates a TEMPORARY Firebase test ruleset, not production Faculty Fund rules.
// Only specifically named test workspaces can use the experimental collections.
const fs=require('node:fs');
const normal=fs.readFileSync('firestore.rules','utf8');
const fixture=fs.readFileSync('emulator-tests/fixtures/faculty-spark-discovery-proof.rules','utf8');
const begin=' match /databases/{database}/documents {\n';
if(!fixture.includes(begin)||!fixture.endsWith(' }\n}\n')||!normal.endsWith('  }\n}\n'))throw Error('Rules layout changed; review generator');
let content=fixture.split(begin)[1].slice(0,-5);
const old='function signed(o) { return request.auth != null && exists(member(o,request.auth.uid)); }';
const replacement="function signed(o) { return o.matches('^org~faculty fund test .+$') && request.auth != null && exists(member(o,request.auth.uid)); }";
if(!content.includes(old))throw Error('Fixture guard changed; review generator');
content=content.replace(old,()=>replacement);
const output=normal.slice(0,-6)+'\n    // TEST ONLY: experimental Faculty Fund; fictitious records only.\n'+content+'  }\n}\n';
fs.writeFileSync('firestore.faculty-test.rules',output);
