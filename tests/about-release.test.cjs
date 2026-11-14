const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('sw.js','utf8');
async function activation(keys,{failPut=false}={}){
 const handlers={},puts=[],deleted=[];let claimed=0;
 const caches={keys:async()=>keys,open:async name=>({put:async(key,value)=>{if(failPut)throw Error('blocked');puts.push([name,key,value.body])}}),delete:async key=>deleted.push(key)};
 const self={addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>claimed++}};
 vm.runInNewContext(worker,{self,caches,URL,Response:class{constructor(body){this.body=body}},Promise,console:{warn(){}}});let pending;handlers.activate({waitUntil:p=>pending=p});await pending;return {puts,deleted,claimed};
}
test('worker records the release marker only on an update and keeps other apps caches',async()=>{
 let fresh=await activation(['pondo-v74','other-app']);assert.equal(fresh.puts.length,0);assert.deepEqual(fresh.deleted,[]);assert.equal(fresh.claimed,1);
 let update=await activation(['pondo-v73','pondo-v74','other-app']);assert.deepEqual(update.puts,[['pondo-v74','./.pondo-update-ready-v74','updated']]);assert.deepEqual(update.deleted,['pondo-v73']);assert.equal(update.claimed,1);
});
test('marker storage failure never prevents update activation',async()=>{let result=await activation(['pondo-v73','pondo-v74'],{failPut:true});assert.deepEqual(result.deleted,['pondo-v73']);assert.equal(result.claimed,1)});
test('About dialog, release version, update marker and readiness hooks stay in sync',()=>{
 assert.match(html,/id="aboutMenuItem"[^>]*onclick="closeHeaderMore\(\);openPondoAbout\(\)"/);
 assert.match(html,/id="aboutOverlay"[^>]*hidden/);assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="aboutTitle"/);
 assert.match(html,/App version 74/);assert.match(worker,/CACHE_VERSION = 'pondo-v74'/);assert.match(html,/const release='74'/);assert.match(worker,/\.pondo-update-ready-v74/);
 assert.match(html,/await navigator\.serviceWorker\.ready/);assert.match(html,/worker\.state==='activated'/);assert.match(html,/worker\.addEventListener\('statechange',changed\)/);assert.match(html,/cache\.match\(marker\)/);assert.match(html,/window\.pondoCheckWhatsNew\?\.\(\)/);
 assert.match(html,/if\(automatic\)acknowledge\(\)/);assert.match(html,/document\.body\.classList\.contains\('modal-open'\)/);
 assert.match(html,/window\.pondoAppUpdates\.checkNow\(\)/);assert.match(html,/window\.pondoAppUpdates\?\.apply\(\)/);
});
