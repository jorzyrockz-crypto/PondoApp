const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {canonicalName,nameId,createService}=require('../organization-functions/service.cjs');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
function setup(ready=true){
 const data=new Map();if(ready)data.set('organizationDirectoryConfig/migration',{ready:true});let next=0,queue=Promise.resolve();
 const ref=path=>({path,id:path.split('/').pop()});
 const collection=path=>({doc:()=>ref(path+'/org'+(++next)),where:(field,op,value)=>({path,filter:{field,value},max:100,limit(n){this.max=n;return this}}),limit:n=>({path,max:n})});
 const db={doc:ref,collection,runTransaction(fn){let task=queue.then(async()=>{const writes=[];const tx={async get(r){if(r.max){let docs=[...data].filter(([key,v])=>key.startsWith(r.path+'/')&&!key.slice(r.path.length+1).includes('/')&&(!r.filter||v[r.filter.field]===r.filter.value)).slice(0,r.max).map(([key,v])=>({id:key.split('/').pop(),data:()=>v}));return {docs}}const value=data.get(r.path);return {exists:value!==undefined,data:()=>value}},create(r,v){if(data.has(r.path))throw Error('exists');writes.push(()=>data.set(r.path,v))},set(r,v){writes.push(()=>data.set(r.path,v))},update(r,v){writes.push(()=>data.set(r.path,{...data.get(r.path),...v}))}};const out=await fn(tx);writes.forEach(w=>w());return out});queue=task.catch(()=>{});return task}};
 return {data,service:createService({db,FieldValue:{serverTimestamp:()=>123},HttpsError,now:()=>1000})};
}
const request=(uid,data={})=>({auth:{uid,token:{name:uid,email:uid+'@example.test'}},data});
test('names normalize case, Unicode compatibility and whitespace consistently',()=>{assert.equal(canonicalName('  Ｐondo  School ').key,'pondo school');assert.equal(nameId(canonicalName('PONDO SCHOOL').key),nameId(canonicalName('pondo school').key));assert.throws(()=>canonicalName('bad\u200bname'));});
test('registry fails closed before migration and parallel duplicate creation has one winner',async()=>{
 const disabled=setup(false);await assert.rejects(disabled.service.create(request('a',{name:'School'})),{code:'failed-precondition'});
 const {service,data}=setup();const results=await Promise.allSettled([service.create(request('a',{name:'School Fund'})),service.create(request('b',{name:'  school   fund  '}))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'already-exists');assert.equal([...data.keys()].filter(x=>x.startsWith('organizationNames/')).length,1);
});
test('search is private by default and request approval requires an owner with an explicit role',async()=>{
 const {service,data}=setup();const {orgId}=await service.create(request('owner',{name:'School Fund'}));assert.equal((await service.search(request('guest',{name:'school fund'}))).organization,null);
 await assert.rejects(service.visibility(request('guest',{orgId,discoverable:true})),{code:'permission-denied'});
 await service.visibility(request('owner',{orgId,discoverable:true}));assert.equal((await service.search(request('guest',{name:' SCHOOL   FUND '}))).organization.id,orgId);
 await service.request(request('guest',{orgId}));assert.equal(data.has(`organizations/${orgId}/members/guest`),false);
 await assert.rejects(service.decide(request('guest',{orgId,uid:'guest',decision:'approve',role:'reviewer'})),{code:'permission-denied'});
 await assert.rejects(service.decide(request('owner',{orgId,uid:'guest',decision:'approve',role:'owner'})),{code:'invalid-argument'});
 assert.equal((await service.pending(request('owner',{orgId}))).requests.length,1);await service.decide(request('owner',{orgId,uid:'guest',decision:'approve',role:'reviewer'}));assert.equal(data.get(`organizations/${orgId}/members/guest`).role,'reviewer');assert.equal((await service.mine(request('guest'))).requests[0].status,'approved');
 data.delete(`organizations/${orgId}/members/guest`);assert.equal((await service.mine(request('guest'))).requests[0].status,'not-a-member');
 await service.visibility(request('owner',{orgId,discoverable:false}));assert.equal((await service.search(request('guest',{name:'School Fund'}))).organization,null);await assert.rejects(service.request(request('other',{orgId})),{code:'not-found'});
});
test('rejection does not grant access and stale decisions fail',async()=>{const {service,data}=setup();let {orgId}=await service.create(request('owner',{name:'Group'}));await service.visibility(request('owner',{orgId,discoverable:true}));await service.request(request('guest',{orgId}));await service.decide(request('owner',{orgId,uid:'guest',decision:'reject'}));assert.equal(data.has(`organizations/${orgId}/members/guest`),false);assert.equal((await service.mine(request('guest'))).requests[0].status,'rejected');await assert.rejects(service.decide(request('owner',{orgId,uid:'guest',decision:'approve',role:'reviewer'})),{code:'failed-precondition'});});
test('rules prevent clients from bypassing naming and discovery via organization writes',()=>{const rules=fs.readFileSync('firestore.rules','utf8');assert.match(rules,/allow create, update, delete: if false;/);assert.match(rules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);});

test('authenticated lookup is bounded and duplicate pending requests remain idempotent',async()=>{
 const {service,data}=setup();await assert.rejects(service.search({data:{name:'X'}}),{code:'unauthenticated'});
 const {orgId}=await service.create(request('owner',{name:'X'}));await service.visibility(request('owner',{orgId,discoverable:true}));await service.request(request('guest',{orgId}));await service.request(request('guest',{orgId}));assert.equal((await service.pending(request('owner',{orgId}))).requests.length,1);
 for(let i=0;i<30;i++)await service.search(request('probe',{name:'X'}));await assert.rejects(service.search(request('probe',{name:'X'})),{code:'resource-exhausted'});
 await Promise.allSettled([service.decide(request('owner',{orgId,uid:'guest',decision:'approve',role:'reviewer'})),service.decide(request('owner',{orgId,uid:'guest',decision:'reject'}))]);assert.equal(data.get(`organizations/${orgId}/members/guest`).role,'reviewer');assert.equal(data.get(`organizations/${orgId}/joinRequests/guest`).status,'approved');
});
