'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{fields,key,plan}=require('../offline-sync.js');
const blank=()=>Object.fromEntries([['org',{name:'Here'}],...fields.map(k=>[k,[]])]);
test('one-way plan preserves destination metadata and records, adds new IDs and skips matching IDs',()=>{
 const a=blank(),b=blank();a.funds=[{id:'same',name:'Same',amount:3},{id:'keep',name:'Existing'}];b.org.name='Other';b.funds=[{amount:3,name:'Same',id:'same'},{id:'new',name:'New'}];const p=plan(a,b);assert.equal(p.unresolved,0);assert.equal(p.unchanged,1);assert.deepEqual(p.changes.map(x=>x.kind),['add']);assert.equal(p.merged.org.name,'Here');assert.deepEqual(p.merged.funds.map(x=>x.id),['same','keep','new']);assert.equal(a.funds.length,2);assert.equal(b.funds.length,2);
});
test('each conflicting ID must be explicitly resolved; choices are scoped to type and ID',()=>{
 const a=blank(),b=blank();a.funds=[{id:'one',name:'Old'}];b.funds=[{id:'one',name:'New'}];a.projects=[{id:'one',name:'Old project'}];b.projects=[{id:'one',name:'New project'}];let p=plan(a,b);assert.equal(p.unresolved,2);p=plan(a,b,{[key('funds','one')]:'offline',[key('projects','one')]:'destination'});assert.equal(p.unresolved,0);assert.equal(p.merged.funds[0].name,'New');assert.equal(p.merged.projects[0].name,'Old project');assert.deepEqual(p.changes.map(x=>x.kind),['replace']);
});
test('malformed and duplicate record IDs fail instead of being silently dropped',()=>{const a=blank(),b=blank();b.txs=[{id:'same'},{id:'same'}];assert.throws(()=>plan(a,b),/duplicate/);b.txs=[{name:'missing ID'}];assert.throws(()=>plan(a,b),/Invalid/);delete b.payables;assert.throws(()=>plan(a,b),/Invalid/)});
