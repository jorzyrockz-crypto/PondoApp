'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),ledger=require('../unified-ledger.js');
test('retired Faculty Fund is absent from app runtime, navigation, roles and offline shell',()=>{
 assert.doesNotMatch(html,/faculty-fund-(ui|notifications|spark)|pondoFacultyAPI|PondoFacultyFundUI|startFacultyWatch|faculty-president|fundView-faculty|value="FACULTY"/);
 assert.doesNotMatch(sw,/faculty-fund-(ui|notifications)/);
 assert.equal(JSON.parse(fs.readFileSync('firebase.json')).functions,undefined);
 assert.equal(typeof ledger.combineDashboard,'undefined');assert.equal(typeof ledger.facultyCashReport,'undefined');
});
test('cash and history exclusion is disclosed across core screens and exported reports',()=>{
 for(const tab of ['dashboard','funds','transactions','report']){
  const start=html.indexOf('id="tab-'+tab+'"');assert.ok(start>=0);assert.match(html.slice(start,start+600),/Faculty Fund is retired[\s\S]*excluded/);
 }
 assert.match(html,/Faculty Fund is retired\. Its stored balances and history are excluded from this report/);
 assert.match(html,/Scope note','Retired Faculty Fund balances and history are excluded/);
});
