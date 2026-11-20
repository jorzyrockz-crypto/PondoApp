'use strict';
// Generate only an isolated experimental rules fixture; never a deploy target.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),base=fs.readFileSync(path.join(__dirname,'firestore.rules'),'utf8'),faculty=fs.readFileSync(path.join(root,'firestore.faculty-test.rules'),'utf8');
const marker='\n    // TEST ONLY: experimental Faculty Fund; fictitious records only.\n';
if(!base.endsWith('  }\n}\n')||!faculty.includes(marker))throw Error('Rules layout changed; review generator.');
let suffix=faculty.slice(faculty.indexOf(marker));
const old="function signed(o) { return o.matches('^org~faculty fund test .+$') && request.auth != null && exists(member(o,request.auth.uid)); }";
const next="function signed(o) { return o.matches('^org~faculty fund test .+$') && request.auth != null && orgActive(o) && exists(member(o,request.auth.uid)); }";
if(!suffix.includes(old))throw Error('Faculty access guard changed; review generator.');
suffix=suffix.replace(old,()=>next);
fs.writeFileSync(path.join(__dirname,'firestore.faculty-test.rules'),base.slice(0,-6)+suffix);
