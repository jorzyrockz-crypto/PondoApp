const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const worker=fs.readFileSync('sw.js','utf8');
function setup({failFetch=false}={}){
 const handlers={},deleted=[],matches=[],opened=[];
 const self={location:{origin:'https://example.test',href:'https://example.test/PondoApp/sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}}};
 const caches={keys:async()=>['pondo-v63','pondo-v64','pondo-v65','pondo-v66','pondo-v67','pondo-v68','pondo-v69','pondo-v70','pondo-v71','custodianpro-v1','chronos-v1','other-app'],delete:async k=>deleted.push(k),open:async k=>{opened.push(k);return {match:async request=>{matches.push([k,request]);return undefined},put:async()=>{}}}};
 const fetch=async()=>{if(failFetch)throw Error('offline');return {status:200,clone:()=>({})}};
 vm.runInNewContext(worker,{self,caches,URL,fetch,Promise});return {handlers,deleted,matches,opened};
}
test('Pondo has its own stable ID, distinct from root IDs on a shared host',()=>{
 // Manifest IDs are resolved relative to start_url origin, not the manifest directory.
 const url=new URL(manifest.start_url,'https://example.test/PondoApp/manifest.webmanifest');
 const pondo=new URL(manifest.id,url.origin),custodianOld=new URL('./',url.origin);
 assert.equal(pondo.href,'https://example.test/PondoApp/');assert.notEqual(pondo.href,custodianOld.href);
 assert.equal(url.href,'https://example.test/PondoApp/index.html');assert.equal(new URL(manifest.scope,'https://example.test/PondoApp/manifest.webmanifest').href,'https://example.test/PondoApp/');
});
test('activation removes only obsolete Pondo cache versions',async()=>{
 const t=setup();let wait;t.handlers.activate({waitUntil:p=>wait=p});await wait;assert.deepEqual(t.deleted,['pondo-v63','pondo-v64','pondo-v65','pondo-v66','pondo-v67','pondo-v68','pondo-v69','pondo-v70']);
});
test('offline navigation and static assets only query the current Pondo cache',async()=>{
 const t=setup({failFetch:true});
 for(const [url,mode] of [['https://example.test/PondoApp/index.html','navigate'],['https://example.test/PondoApp/public-report/index.html','navigate'],['https://example.test/PondoApp/icons/icon-192.png','no-cors']]){
  let result;t.handlers.fetch({request:{method:'GET',mode,url},respondWith:p=>result=p});await result.catch(()=>undefined);
 }
 assert.equal(t.matches.length,3);assert.ok(t.matches.every(([name])=>name==='pondo-v71'));
});
