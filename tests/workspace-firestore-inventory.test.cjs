'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{inventoryWorkspace}=require('../scripts/workspace-firestore-inventory.cjs');
// Minimal read-only mock includes missing parent references, as Firestore
// listDocuments can return them when descendants still exist.
function mock(rows){
 const paths=Object.keys(rows),docs=new Set(paths);
 function hasDesc(path){return paths.some(p=>p.startsWith(path+'/'))}
 const ref=path=>({path,id:path.split('/').at(-1),async get(){return {exists:docs.has(path),data:()=>rows[path]}},collection:name=>collection(path+'/'+name),async listCollections(){const prefix=path+'/';const names=new Set(paths.filter(p=>p.startsWith(prefix)).map(p=>p.slice(prefix.length).split('/')[0]));return [...names].map(n=>collection(prefix+n))}});
 const collection=path=>({id:path.split('/').at(-1),doc:id=>ref(path+'/'+id),async listDocuments(){const prefix=path+'/';return [...new Set(paths.filter(p=>p.startsWith(prefix)).map(p=>p.slice(prefix.length).split('/')[0]))].map(id=>ref(prefix+id));},where(field,op,value){return {async get(){const prefix=path+'/',entries=paths.filter(p=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')&&rows[p]?.[field]===value);return {size:entries.length,docs:entries.map(p=>({data:()=>rows[p]}))}}}}});
 return {doc:ref,collection};
}
test('inventory discovers nested documents under a missing parent and counts external links without exposing IDs',async()=>{
 const org='org~demo',db=mock({['organizations/'+org]:{name:'Private'},['organizations/'+org+'/members/a']:{role:'owner'},['organizations/'+org+'/hidden/ghost/deeper/doc']:{secret:'never printed'},'users/a':{orgMemberships:[org],activeOrganizationId:org},['users/a/organizationRequests/'+org]:{orgId:org},'users/a/teamNotices/n':{orgId:org},'invites/code':{orgId:org},'publicShareConfig/share':{orgId:org,publicId:'publicid'},'publicReports/publicid':{report:'secret'}});
 const result=await inventoryWorkspace({db,orgId:org});assert.equal(result.workspaceRootExists,true);assert.equal(result.workspaceCollections.members,1);assert.equal(result.workspaceCollections['hidden/*/deeper'],1);assert.equal(result.missingParentReferences,1);assert.equal(result.accountIndexes.profileMemberships,1);assert.equal(result.accountIndexes.requestIndexes,1);assert.equal(result.accountIndexes.notices,1);assert.equal(result.externalRecords.invites,1);assert.equal(result.externalRecords.referencedPublicReports,1);assert.doesNotMatch(JSON.stringify(result),/secret|publicid|Private|code/);
});
test('inventory rejects invalid IDs and fails closed on document, depth, and user limits',async()=>{
 const org='org~demo',db=mock({['organizations/'+org+'/members/a']:{},['organizations/'+org+'/hidden/x/nested/y']:{},'users/a':{},'users/b':{}});
 await assert.rejects(inventoryWorkspace({db,orgId:'bad/id'}),/Invalid/);await assert.rejects(inventoryWorkspace({db,orgId:org,limits:{maxRefs:1}}),/incomplete/);await assert.rejects(inventoryWorkspace({db,orgId:org,limits:{maxDepth:1}}),/incomplete/);await assert.rejects(inventoryWorkspace({db,orgId:org,limits:{maxUsers:1}}),/incomplete/);
});
