'use strict';
// Experiment only. The production rules and app never load this candidate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,query,where,writeBatch,serverTimestamp,arrayRemove}=require('firebase/firestore');
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required.');
let env;const projectId='demo-pondo-security',orgId='org~faculty fund test cleanup',root='organizations/'+orgId,variant=process.env.PONDO_SPARK_DELETE_RULES||'ordinary';
const variants={ordinary:'firestore.rules',facultyTest:'firestore.faculty-test.rules',facultyRelease:'firestore.faculty-release-candidate.rules',facultyRecovery:'firestore.faculty-recovery-candidate.rules'};
if(!Object.hasOwn(variants,variant))throw Error('Invalid candidate variant.');
test.before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync(path.join(__dirname,'../experiments/spark-workspace-delete',variants[variant]),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore(),rows={
 [root]:{name:'Cleanup',createdBy:'owner',discoverable:true},[root+'/members/owner']:{uid:'owner',role:'owner'},[root+'/members/otherowner']:{uid:'otherowner',role:'owner'},[root+'/members/editor']:{uid:'editor',role:'project-manager'},[root+'/members/viewer']:{uid:'viewer',role:'reviewer'},
 ['users/stranger']:{orgMemberships:['another-team'],displayName:'Stranger'},['users/viewer']:{orgMemberships:[orgId,'another-team'],displayName:'Private Viewer',activeOrganizationId:orgId},['users/viewer/organizationRequests/'+orgId]:{orgId},[root+'/sparkDiscoveryRevision/current']:{revision:1,updatedBy:'owner'},[root+'/sparkDiscoveryPeople/p']:{name:'Sample'},[root+'/data/snapshot']:{_syncRevision:1,updatedBy:'owner',payables:[]},[root+'/refundReceipts/request']:{uid:'viewer',digest:'a'.repeat(64),image:'data:image/jpeg;base64,YWJj'},[root+'/hidden/private']:{secret:true},'invites/INVITE':{orgId:'org~faculty fund test cleanup',role:'reviewer',revoked:false,expiresAt:null,maxUses:null,usedCount:0,createdBy:'owner'}
 };for(const [p,v] of Object.entries(rows))await setDoc(doc(db,p),v)})});test.after(async()=>{if(env)await env.cleanup()});
const db=uid=>env.authenticatedContext(uid).firestore(),freeze=()=>({deletionState:'deleting',deletingBy:'owner',deletingAt:serverTimestamp(),discoverable:false});
test('only a current owner can freeze; the freeze immediately blocks normal reads, writes and invitations',async()=>{
 const owner=db('owner'),editor=db('editor'),viewer=db('viewer'),outsider=db('outsider');
 await assertFails(updateDoc(doc(editor,root),{...freeze(),deletingBy:'editor'}));await assertFails(updateDoc(doc(outsider,root),{...freeze(),deletingBy:'outsider'}));await assertFails(updateDoc(doc(owner,root),{...freeze(),deletingBy:'editor'}));
 // A write prepared before the lock must still be evaluated against the lock.
 const stale=writeBatch(editor);stale.update(doc(editor,root+'/data/snapshot'),{_syncRevision:2,updatedBy:'editor'});
 await assertSucceeds(updateDoc(doc(owner,root),freeze()));await assertFails(stale.commit());
 await assertFails(getDoc(doc(viewer,root+'/data/snapshot')));await assertFails(getDoc(doc(viewer,root+'/sparkDiscoveryPeople/p')));await assertFails(setDoc(doc(editor,root+'/sparkDiscoveryRevision/current'),{revision:2,updatedBy:'editor',updatedAt:serverTimestamp()}));await assertFails(getDoc(doc(editor,root+'/refundReceipts/request')));await assertFails(getDoc(doc(outsider,'invites/INVITE')));
 await assertFails(setDoc(doc(owner,'invites/NEW'),{orgId:'org~faculty fund test cleanup',role:'reviewer',createdBy:'owner',usedCount:0,revoked:false,maxUses:null,expiresAt:null}));
 const redeem=writeBatch(outsider);redeem.set(doc(outsider,root+'/members/outsider'),{uid:'outsider',role:'reviewer',inviteCode:'INVITE'});redeem.update(doc(outsider,'invites/INVITE'),{usedCount:1});await assertFails(redeem.commit());
 await assertFails(updateDoc(doc(db('otherowner'),root),{discoverable:true}));
});
test('only the initiating owner can list and delete supported records; finalization and unknown data remain forbidden',async()=>{
 const owner=db('owner'),other=db('otherowner'),viewer=db('viewer');await assertSucceeds(updateDoc(doc(owner,root),freeze()));
 await assertSucceeds(getDocs(collection(owner,root+'/refundReceipts')));await assertFails(getDocs(collection(other,root+'/refundReceipts')));await assertFails(getDocs(collection(viewer,root+'/refundReceipts')));
 await assertSucceeds(getDocs(query(collection(owner,'invites'),where('orgId','==','org~faculty fund test cleanup'))));await assertFails(getDocs(query(collection(viewer,'invites'),where('orgId','==','org~faculty fund test cleanup'))));
 await assertFails(deleteDoc(doc(other,root+'/data/snapshot')));await assertSucceeds(deleteDoc(doc(owner,root+'/data/snapshot')));await assertSucceeds(deleteDoc(doc(owner,root+'/refundReceipts/request')));await assertSucceeds(deleteDoc(doc(owner,'invites/INVITE')));
 await assertFails(deleteDoc(doc(owner,root+'/members/owner')));await assertFails(deleteDoc(doc(owner,root+'/members/viewer')));
 // The owner may remove only this org index and only while atomically
 // removing the member/request. No read or unrelated profile edits are granted.
 await assertFails(getDoc(doc(owner,'users/viewer')));
 await assertFails(updateDoc(doc(owner,'users/viewer'),{_workspaceCleanupOrg:orgId,orgMemberships:arrayRemove(orgId),activeOrganizationId:null,displayName:'tampered'}));
 await assertFails(updateDoc(doc(owner,'users/viewer'),{_workspaceCleanupOrg:orgId,orgMemberships:arrayRemove(orgId)}));
 await assertFails(updateDoc(doc(owner,'users/viewer'),{_workspaceCleanupOrg:orgId,orgMemberships:['another-team','forged']}));
 await assertFails(updateDoc(doc(owner,'users/stranger'),{_workspaceCleanupOrg:orgId,orgMemberships:[]}));
 const remove=writeBatch(owner);remove.set(doc(owner,'users/viewer'),{_workspaceCleanupOrg:orgId,orgMemberships:arrayRemove(orgId),activeOrganizationId:null},{merge:true});remove.delete(doc(owner,'users/viewer/organizationRequests/'+orgId));remove.delete(doc(owner,root+'/members/viewer'));await assertSucceeds(remove.commit());
 await env.withSecurityRulesDisabled(async ctx=>{const profile=(await getDoc(doc(ctx.firestore(),'users/viewer'))).data();assert.deepEqual(profile.orgMemberships,['another-team']);assert.equal(profile.displayName,'Private Viewer');assert.equal(profile.activeOrganizationId,null)});
 await assertFails(deleteDoc(doc(owner,root+'/hidden/private')));await assertFails(updateDoc(doc(owner,root),{deletionState:'deleted'}));await assertFails(deleteDoc(doc(owner,root)));
 const lock=await assertSucceeds(getDoc(doc(owner,root)));assert.equal(lock.data().deletionState,'deleting');
});

test('experimental client resumes bounded cleanup against the candidate rules without claiming completion',async()=>{
 const {createExperimentalSparkCleanup}=await import('../experiments/spark-workspace-delete/cleanup.mjs');
 const api=require('firebase/firestore'),owner=db('owner'),context={orgId:'org~faculty fund test cleanup',uid:'owner',currentUid:'owner',online:true};
 const cleanup=createExperimentalSparkCleanup({db:owner,api,getContext:()=>context});
 assert.equal(await cleanup.freeze('org~faculty fund test cleanup','owner'),'frozen');
 let last;for(let i=0;i<20;i++){last=await cleanup.clearNext('org~faculty fund test cleanup','owner');if(last.state==='awaiting-verification')break;}
 assert.equal(last.state,'awaiting-verification');assert.equal(last.finalized,false);
 assert.equal((await assertSucceeds(getDoc(doc(owner,root)))).data().deletionState,'deleting');
 await env.withSecurityRulesDisabled(async ctx=>{const admin=ctx.firestore();assert.equal((await getDoc(doc(admin,root+'/hidden/private'))).exists(),true);assert.equal((await getDoc(doc(admin,root+'/members/owner'))).exists(),true);assert.equal((await getDoc(doc(admin,root+'/data/snapshot'))).exists(),false);assert.equal((await getDoc(doc(admin,root+'/sparkDiscoveryPeople/p'))).exists(),false);const user=(await getDoc(doc(admin,'users/viewer'))).data();assert.deepEqual(user.orgMemberships,['another-team']);assert.equal(user.activeOrganizationId,null);assert.equal((await getDoc(doc(admin,'users/viewer/organizationRequests/'+orgId))).exists(),false)});
});


test('cleanup of multiple members is chunked, preserves unrelated account fields and creates missing index profiles safely',async()=>{
 const {createExperimentalSparkCleanup}=await import('../experiments/spark-workspace-delete/cleanup.mjs');const api=require('firebase/firestore'),owner=db('owner');
 await env.withSecurityRulesDisabled(async ctx=>{const admin=ctx.firestore();for(let i=0;i<9;i++){await setDoc(doc(admin,root+'/members/m'+i),{uid:'m'+i,role:'reviewer'});if(i!==3)await setDoc(doc(admin,'users/m'+i),{orgMemberships:[orgId,'another-team'],displayName:'Member '+i,activeOrganizationId:i%2?orgId:'another-team',organizationId:i%3?orgId:'another-team'});}});
 const cleanup=createExperimentalSparkCleanup({db:owner,api,getContext:()=>({orgId,uid:'owner',currentUid:'owner',online:true})});await cleanup.freeze(orgId,'owner');let memberBatches=0,last;
 for(let i=0;i<40;i++){last=await cleanup.clearNext(orgId,'owner');if(last.group==='members'){memberBatches++;assert.ok(last.removed<=4)}if(last.state==='awaiting-verification')break;}
 assert.equal(last.state,'awaiting-verification');assert.ok(memberBatches>=3);
 await env.withSecurityRulesDisabled(async ctx=>{const admin=ctx.firestore();for(let i=0;i<9;i++){const user=(await getDoc(doc(admin,'users/m'+i))).data();assert.deepEqual(user.orgMemberships,i===3?[]:['another-team']);if(i!==3){assert.equal(user.displayName,'Member '+i);assert.equal(user.activeOrganizationId,i%2?null:'another-team');assert.equal(user.organizationId,i%3?null:'another-team');}assert.equal((await getDoc(doc(admin,root+'/members/m'+i))).exists(),false)}});
});


test('cleanup of the initiating owner’s join request preserves their unrelated active workspace',async()=>{
 const {createExperimentalSparkCleanup}=await import('../experiments/spark-workspace-delete/cleanup.mjs'),api=require('firebase/firestore'),owner=db('owner');
 await env.withSecurityRulesDisabled(async ctx=>{const admin=ctx.firestore();await setDoc(doc(admin,'users/owner'),{orgMemberships:[orgId,'another-team'],activeOrganizationId:'another-team',organizationId:orgId,displayName:'Owner'});await setDoc(doc(admin,'users/owner/organizationRequests/'+orgId),{orgId});await setDoc(doc(admin,root+'/joinRequests/owner'),{uid:'owner',status:'approved'});});
 const cleanup=createExperimentalSparkCleanup({db:owner,api,getContext:()=>({orgId,uid:'owner',currentUid:'owner',online:true})});await cleanup.freeze(orgId,'owner');
 for(let i=0;i<40;i++){const r=await cleanup.clearNext(orgId,'owner');if(r.state==='awaiting-verification')break;}
 const profile=(await assertSucceeds(getDoc(doc(owner,'users/owner')))).data();assert.deepEqual(profile.orgMemberships,['another-team']);assert.equal(profile.activeOrganizationId,'another-team');assert.equal(profile.organizationId,null);assert.equal(profile.displayName,'Owner');
});


test('activated Faculty and recovery control paths are frozen without pretending to erase backups', {skip: !['facultyRelease','facultyRecovery'].includes(variant)}, async()=>{
 const actualOrg='org~activated faculty',actualRoot='organizations/'+actualOrg,owner=db('owner'),viewer=db('viewer');
 await env.withSecurityRulesDisabled(async ctx=>{const admin=ctx.firestore();for(const [p,v] of Object.entries({
  [actualRoot]:{name:'Activated Faculty',createdBy:'owner',discoverable:true},[actualRoot+'/members/owner']:{uid:'owner',role:'owner'},[actualRoot+'/members/viewer']:{uid:'viewer',role:'reviewer'},
  [actualRoot+'/facultyFundRelease/current']:{enabled:true,schema:1},[actualRoot+'/sparkDiscoveryPeople/p']:{name:'Sample'},[actualRoot+'/sparkDiscoveryRevision/current']:{revision:1,updatedBy:'owner'},
  [actualRoot+'/sparkVerifiedBackups/backup']:{manifest:[],revision:1},[actualRoot+'/sparkVerifiedBackups/backup/collections/sparkDiscoveryPeople/entries/p']:{name:'Archived'},[actualRoot+'/sparkRestoreProof/current']:{remaining:0},[actualRoot+'/sparkRestoreProofSessions/session']:{state:'active'}
 }))await setDoc(doc(admin,p),v);});
 await assertSucceeds(getDoc(doc(viewer,actualRoot+'/facultyFundRelease/current')));
 if(variant==='facultyRelease')await assertSucceeds(getDoc(doc(viewer,actualRoot+'/sparkDiscoveryPeople/p')));
 if(variant==='facultyRecovery'){await assertSucceeds(getDoc(doc(owner,actualRoot+'/sparkVerifiedBackups/backup')));await assertSucceeds(getDoc(doc(owner,actualRoot+'/sparkVerifiedBackups/backup/collections/sparkDiscoveryPeople/entries/p')));}
 await assertSucceeds(updateDoc(doc(owner,actualRoot),freeze()));
 await assertFails(getDoc(doc(viewer,actualRoot+'/facultyFundRelease/current')));await assertFails(getDoc(doc(viewer,actualRoot+'/sparkDiscoveryPeople/p')));
 await assertFails(getDoc(doc(owner,actualRoot+'/facultyFundRelease/current')));await assertFails(deleteDoc(doc(owner,actualRoot+'/facultyFundRelease/current')));
 await assertFails(getDoc(doc(owner,actualRoot+'/sparkVerifiedBackups/backup')));await assertFails(getDoc(doc(owner,actualRoot+'/sparkVerifiedBackups/backup/collections/sparkDiscoveryPeople/entries/p')));
 await assertFails(getDoc(doc(owner,actualRoot+'/sparkRestoreProof/current')));await assertFails(updateDoc(doc(owner,actualRoot+'/sparkRestoreProofSessions/session'),{state:'completed'}));
 await env.withSecurityRulesDisabled(async ctx=>{const admin=ctx.firestore();assert.equal((await getDoc(doc(admin,actualRoot+'/facultyFundRelease/current'))).exists(),true);assert.equal((await getDoc(doc(admin,actualRoot+'/sparkVerifiedBackups/backup/collections/sparkDiscoveryPeople/entries/p'))).exists(),true)});
});
