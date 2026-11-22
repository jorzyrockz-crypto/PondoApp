'use strict';
// Run the production matcher in isolation; the UI's authorization and routing
// checks are covered by the browser suites. No search text leaves the process.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','quick-actions.js'),'utf8');
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error('Quick Action matcher sections not found');return source.slice(a,b)}
const code=[
 slice(' const items=','\n // Curated action phrases'),
 slice(' const synonyms=','\n // A browser cannot reliably enumerate'),
 slice(' const purposes=','\n window.pondoQuickActionValidate='),
 '\nfunction evaluate(value,allowedIds){query.value=value;allowedSet=allowedIds?new Set(allowedIds):null;render();return {ids:matches.map(item=>item.id),kind:matchKind}}'
].join('\n');
const context=vm.createContext({query:{value:''},showStage(){},allowed:id=>!context.allowedSet||context.allowedSet.has(id),allowedSet:null,matches:[],matchKind:'exact',stage:'actions'});
vm.runInContext(code,context);
module.exports=(value,allowedIds)=>context.evaluate(value,allowedIds);
