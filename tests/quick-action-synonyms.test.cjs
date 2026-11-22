'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('quick-actions.js','utf8');
const items=vm.runInNewContext(source.slice(source.indexOf(' const items='),source.indexOf('\n // Curated action phrases'))+'\nitems');
const synonyms=vm.runInNewContext(source.slice(source.indexOf(' const synonyms='),source.indexOf('\n // A browser cannot reliably enumerate'))+'\nsynonyms');
test('every Quick Action has at least ten distinct curated local phrases',()=>{
 const ids=Array.from(items,item=>item.id),seen=new Map();assert.deepEqual(Object.keys(synonyms).sort(),ids.sort());
 for(const id of ids){const list=synonyms[id];assert.ok(list.length>=10,id);assert.equal(new Set(list).size,list.length,id);for(const phrase of list){assert.equal(typeof phrase,'string');assert.ok(phrase.trim().length>=3);assert.equal(phrase,phrase.trim().toLowerCase());assert.ok(!seen.has(phrase),`${phrase} appears for ${id} and ${seen.get(phrase)}`);seen.set(phrase,id)}}
});
test('each action has curated purpose descriptions for local search',()=>{
 const purposes=vm.runInNewContext(source.slice(source.indexOf(' const purposes='),source.indexOf('\n // Only suggest meaningful keyword'))+'\npurposes');
 assert.deepEqual(Object.keys(purposes).sort(),Array.from(items,item=>item.id).sort());
 for(const item of items){assert.ok(purposes[item.id].length>=3,item.id);for(const phrase of purposes[item.id])assert.ok(typeof phrase==='string'&&phrase.trim().length>0,item.id)}
 assert.match(source,/item\.description\+' '\+item\.keywords/);
});
test('new entry points keep their explicit routes and permission checks',()=>{
 assert.match(source,/id==='unpaid'\)\{openInvoice\(null,'supplier'\)/);assert.match(source,/id==='death-aid'\)\{showDeathAidCreate\(\)/);assert.match(source,/id==='death-aid'\)return editable\(\)&&deathAidCanWrite\(\)/);assert.match(source,/if\(donationContext\(\)!==originalScope\|\|!allowed\(id\)\)/);
});
