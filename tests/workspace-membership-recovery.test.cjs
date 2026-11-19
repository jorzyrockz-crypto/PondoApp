const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let recover;test.before(async()=>({recoverWorkspaceMemberships:recover}=await import('../workspace-membership-recovery.mjs')));
function setup(){
 const uid='me',db=new Map(),writes=[],requests=[];let current=true,readHook=null,queryHook=null;
 const profile='users/me';db.set(profile,{orgMemberships:['already'],activeOrganizationId:'already',preferences:'keep'});
 const add=(org,{member=true,exists=true,listed=false,mirror=true}={})=>{if(mirror)requests.push({id:org,data:()=>({orgId:org})});if(member)db.set(`organizations/${org}/members/me`,{uid:'me',role:'owner'});if(exists)db.set(`organizations/${org}`,{name:org});if(listed)db.get(profile).orgMemberships.push(org)};
 const snap=path=>({exists:()=>db.has(path),data:()=>db.get(path)});
 const api={doc:(_,...parts)=>parts.join('/'),collection:(_,...parts)=>parts.join('/'),documentId:()=> 'ID',orderBy:x=>['order',x],limit:n=>['limit',n],startAfter:d=>['after',d.id],query:(...x)=>x,arrayUnion:value=>({union:value}),getDocFromServer:async path=>snap(path),getDocsFromServer:async q=>{if(queryHook)await queryHook();let after=q.find(x=>Array.isArray(x)&&x[0]==='after')?.[1];let sorted=requests.slice().sort((a,b)=>a.id.localeCompare(b.id));return {docs:sorted.filter(d=>!after||d.id>after).slice(0,100)}},runTransaction:async(_db,fn)=>{const pending=[];const tx={get:async path=>{if(readHook)await readHook(path);return snap(path)},set:(p,data,options)=>pending.push({p,data,options})};const value=await fn(tx);for(const {p,data,options} of pending){writes.push({p,data,options});const old=db.get(p)||{};db.set(p,{...old,orgMemberships:[...new Set([...(old.orgMemberships||[]),data.orgMemberships.union])]})}return value}};
 return {uid,db,writes,requests,api,add,run:(knownIds=['already'])=>recover({db:{},api,uid,isCurrent:()=>current,knownIds}),setCurrent:x=>current=x,onRead:f=>readHook=f,onQuery:f=>queryHook=f};
}
test('restores only verified memberships to the account list without switching or touching organizations',async()=>{
 const t=setup();t.add('demo');t.add('already',{listed:false});t.add('removed',{member:false});t.add('orphan',{exists:false});t.requests.push({id:'forged',data:()=>({orgId:'different'})});
 const result=await t.run();assert.deepEqual(result,{ids:['demo'],partial:false});assert.equal(t.writes.length,1);assert.equal(t.writes[0].p,'users/me');assert.deepEqual(t.db.get('users/me').orgMemberships,['already','demo']);assert.equal(t.db.get('users/me').activeOrganizationId,'already');assert.equal(t.db.get('users/me').preferences,'keep');
});
test('does not duplicate entries added by another device or trust a cached in-memory index',async()=>{
 const t=setup();t.add('demo',{listed:true});const r=await t.run();assert.deepEqual(r.ids,['demo']);assert.equal(t.writes.length,0);assert.equal(t.db.get('users/me').activeOrganizationId,'already');
});
test('repairs the server profile even if a stale local list already contains the workspace',async()=>{
 const t=setup();t.add('demo');const r=await t.run(['already','demo']);assert.deepEqual(r.ids,['demo']);assert.equal(t.writes.length,1);assert.deepEqual(t.db.get('users/me').orgMemberships,['already','demo']);
});
test('does not overwrite an unmigrated legacy profile and reports partial failure',async()=>{
 const t=setup();t.db.set('users/me',{organizationId:'old'});t.add('demo');const r=await t.run([]);assert.deepEqual(r.ids,[]);assert.equal(r.partial,true);assert.deepEqual(t.db.get('users/me'),{organizationId:'old'});
});
test('account changes and read errors do not restore stale memberships or overwrite other profiles',async()=>{
 let t=setup();t.add('demo');t.onRead(async p=>{if(p.endsWith('/members/me'))t.setCurrent(false)});let result=await t.run();assert.equal(t.writes.length,0);assert.equal(result.partial,true);
 t=setup();t.add('demo');t.onRead(async()=>{throw Error('permission denied')});result=await t.run();assert.equal(result.partial,true);assert.equal(t.writes.length,0);
 t=setup();t.add('demo');t.onQuery(async()=>{t.setCurrent(false)});result=await t.run();assert.equal(result.partial,true);assert.equal(t.writes.length,0);
});
test('scans beyond 100 request entries with bounded pagination',async()=>{
 const t=setup();for(let i=0;i<101;i++)t.add('org-'+String(i).padStart(3,'0'));const r=await t.run();assert.equal(r.ids.length,101);assert.equal(r.partial,false);assert.equal(t.writes.length,101);
});
test('app runs recovery on sign-in and reconnect, and caches the module offline',()=>{
 const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');assert.match(html,/void recoverMembershipList\(user\.uid\)/);assert.match(html,/addEventListener\('online',[^\n]+recoverMembershipList\(uid\)/);assert.match(sw,/\.\/workspace-membership-recovery\.mjs/);assert.match(html,/membershipRecoveryGeneration\+\+/);
});
