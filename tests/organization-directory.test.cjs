const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let mod;test.before(async()=>{mod=await import('../organization-firestore.mjs')});
test('organization names preserve Unicode and canonicalize whitespace and case',()=>{
 assert.deepEqual(mod.organizationName('  Paaralang   Ñandú  '),{name:'Paaralang Ñandú',id:'paaralang ñandú'});
 assert.equal(mod.organizationName('School Fund').id,mod.organizationName('school   FUND').id);
 for(const name of ['', 'a/b', '.', '..', '__system__', 'bad\u200bname', 'x'.repeat(121)])assert.throws(()=>mod.organizationName(name));
 // Unicode lookalikes/normalization equivalents are intentionally not folded.
 assert.notEqual(mod.organizationName('Ａ').id,mod.organizationName('A').id);
});
test('the app uses Firestore rather than organization callable functions',()=>{
 const app=fs.readFileSync('index.html','utf8'),rules=fs.readFileSync('firestore.rules','utf8');
 assert.match(app,/createOrganizationDirectory/);assert.doesNotMatch(app,/httpsCallable\(getFunctions\(firebaseApp/);
 assert.match(rules,/orgId == name\.lower\(\)/);assert.match(rules,/getAfter\(memberPath\(orgId, uid\(\)\)\)/);
 assert.match(rules,/match \/joinRequests\/\{requester\}/);assert.match(rules,/allow list: if isOwner\(orgId\)/);
});
