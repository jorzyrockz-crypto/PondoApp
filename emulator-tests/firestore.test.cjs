'use strict';
// This suite clears only the fixed demo project's loopback emulator.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const api=require('firebase/firestore');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp}=api;
const PROJECT='demo-pondo-security';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Refusing to run: start the local Firestore emulator first.');
let env,createDirectory,organizationName;
test.before(async()=>{({createOrganizationDirectory:createDirectory,organizationName}=await import('../organization-firestore.mjs'));env=await initializeTestEnvironment({projectId:PROJECT,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}})});
test.beforeEach(async()=>env.clearFirestore());test.after(async()=>{if(env)await env.cleanup()});
const client=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const ref=(c,p)=>doc(c,p);
const directory=uid=>{const db=client(uid),u={uid,email:uid+'@example.test',displayName:uid,photoURL:null};return {db,service:createDirectory({db,api,getUser:()=>u})}};
async function seed(rows){await env.withSecurityRulesDisabled(async context=>{const store=context.firestore();for(const [p,value] of Object.entries(rows))await setDoc(ref(store,p),value)})}

test('concurrent case and whitespace variants have one winner, with private-by-default profile',async()=>{
 const a=directory('alice'),b=directory('bob'),guest=directory('guest');
 const outcomes=await Promise.allSettled([a.service.orgCreate({name:' School  Fund '}),b.service.orgCreate({name:'school fund'})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 const winner=outcomes[0].status==='fulfilled'?a:b,orgId='org~school fund';
 assert.equal((await winner.service.orgMyRequests()).requests[0].status,'approved');
 assert.equal((await guest.service.orgSearch({name:'SCHOOL FUND'})).organization,null);
 await assertFails(getDoc(ref(guest.db,`organizations/${orgId}`)));await assertFails(getDocs(collection(guest.db,'organizations')));
 await assertFails(updateDoc(ref(guest.db,`organizations/${orgId}`),{discoverable:true}));
 await assertFails(updateDoc(ref(winner.db,`organizations/${orgId}`),{name:'Other'}));
 await winner.service.orgSetVisibility({orgId,discoverable:true});const found=(await guest.service.orgSearch({name:'SCHOOL FUND'})).organization;assert.equal(found.id,orgId);assert.equal(found.name.toLowerCase(),'school fund');
 await winner.service.orgSetVisibility({orgId,discoverable:false});assert.equal((await guest.service.orgSearch({name:'school fund'})).organization,null);
});

test('Unicode names are supported, while unauthorized creation and forged canonical IDs fail',async()=>{
 const owner=directory('owner'),attacker=directory('attacker');const id=organizationName('Paaralang Ñandú').id;
 assert.equal((await owner.service.orgCreate({name:'Paaralang Ñandú'})).orgId,id);
 await assert.rejects(attacker.service.orgCreate({name:'PAARALANG Ñandú'}));
 const b=writeBatch(attacker.db);b.set(ref(attacker.db,'organizations/org~other'),{name:'Paaralang Ñandú',createdBy:'attacker',createdAt:serverTimestamp(),discoverable:false});b.set(ref(attacker.db,'organizations/org~other/members/attacker'),{uid:'attacker',role:'owner'});await assertFails(b.commit());
 await assertFails(setDoc(ref(attacker.db,'organizations/improper'),{name:'improper',createdBy:'attacker',createdAt:serverTimestamp(),discoverable:false}));
 await assertFails(setDoc(ref(attacker.db,`organizations/${id}/members/attacker`),{uid:'attacker',role:'owner'}));
});

test('join requests require a public org and owner approval, and removal revokes access',async()=>{
 const owner=directory('owner'),guest=directory('guest'),attacker=directory('attacker');const {orgId}=await owner.service.orgCreate({name:'Team'}),p=`organizations/${orgId}`;
 await assert.rejects(guest.service.orgRequestJoin({orgId}));
 await owner.service.orgSetVisibility({orgId,discoverable:true});await guest.service.orgRequestJoin({orgId});await guest.service.orgRequestJoin({orgId});
 assert.equal((await owner.service.orgPendingRequests({orgId})).requests.length,1);assert.equal((await guest.service.orgMyRequests()).requests[0].status,'pending');
 await assertFails(getDocs(collection(guest.db,`${p}/joinRequests`)));await assertFails(getDoc(ref(guest.db,`${p}/data/snapshot`)));
 await assert.rejects(attacker.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'}));
 await assertFails(updateDoc(ref(guest.db,`${p}/joinRequests/guest`),{status:'approved',decidedBy:'guest',decidedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref(owner.db,`${p}/joinRequests/guest`),{status:'approved',decidedBy:'owner',decidedAt:serverTimestamp()}));
 await assert.rejects(owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'owner'}));
 await owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'});
 assert.equal((await guest.service.orgMyRequests()).requests[0].status,'approved');await assertSucceeds(getDoc(ref(guest.db,`${p}/members/guest`)));
 await assertFails(updateDoc(ref(guest.db,`${p}/members/guest`),{role:'owner'}));
 await assertSucceeds(setDoc(ref(owner.db,`${p}/data/snapshot`),{_syncRevision:1,updatedBy:'owner'}));await assertSucceeds(getDoc(ref(guest.db,`${p}/data/snapshot`)));await assertFails(updateDoc(ref(guest.db,`${p}/data/snapshot`),{_syncRevision:2,updatedBy:'guest'}));
 await assertSucceeds(deleteDoc(ref(owner.db,`${p}/members/guest`)));assert.equal((await guest.service.orgMyRequests()).requests[0].status,'not-a-member');await assertFails(getDoc(ref(guest.db,`${p}/data/snapshot`)));
});

test('rejection does not create membership; repeated decisions cannot grant access',async()=>{
 const owner=directory('owner'),guest=directory('guest');const {orgId}=await owner.service.orgCreate({name:'Group'});await owner.service.orgSetVisibility({orgId,discoverable:true});await guest.service.orgRequestJoin({orgId});
 await owner.service.orgDecideRequest({orgId,uid:'guest',decision:'reject'});assert.equal((await guest.service.orgMyRequests()).requests[0].status,'rejected');
 await assert.rejects(owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'}));await assertFails(getDoc(ref(guest.db,`organizations/${orgId}/data/snapshot`)));
 await guest.service.orgRequestJoin({orgId});assert.equal((await guest.service.orgMyRequests()).requests[0].status,'pending');
});

test('reviewer and removed members cannot write; invite use is atomic',async()=>{
 await seed({'organizations/school':{name:'School',discoverable:false},'organizations/school/members/owner':{uid:'owner',role:'owner'},'organizations/school/members/reviewer':{uid:'reviewer',role:'reviewer'},'organizations/school/data/snapshot':{_syncRevision:1,updatedBy:'owner'},'invites/code1':{orgId:'school',createdBy:'owner',role:'reviewer',usedCount:0,maxUses:1,revoked:false,expiresAt:null}});
 const owner=client('owner'),reviewer=client('reviewer'),guest=client('guest'),other=client('other'),p='organizations/school/data/snapshot';
 await assertSucceeds(getDoc(ref(reviewer,p)));await assertFails(updateDoc(ref(reviewer,p),{_syncRevision:2,updatedBy:'reviewer'}));
 await assertFails(setDoc(ref(guest,'organizations/school/members/guest'),{uid:'guest',role:'reviewer',inviteCode:'code1'}));
 let b=writeBatch(guest);b.update(ref(guest,'invites/code1'),{usedCount:1});b.set(ref(guest,'organizations/school/members/guest'),{uid:'guest',role:'reviewer',inviteCode:'code1'});await assertSucceeds(b.commit());
 b=writeBatch(other);b.update(ref(other,'invites/code1'),{usedCount:2});b.set(ref(other,'organizations/school/members/other'),{uid:'other',role:'reviewer',inviteCode:'code1'});await assertFails(b.commit());
 await assertSucceeds(deleteDoc(ref(owner,'organizations/school/members/reviewer')));await assertFails(getDoc(ref(reviewer,p)));
});

test('competing owner decisions cannot create membership after rejection',async()=>{
 const owner=directory('owner'),guest=directory('guest');const {orgId}=await owner.service.orgCreate({name:'Paaralan'});await owner.service.orgSetVisibility({orgId,discoverable:true});await guest.service.orgRequestJoin({orgId});
 const results=await Promise.allSettled([owner.service.orgDecideRequest({orgId,uid:'guest',decision:'approve',role:'reviewer'}),owner.service.orgDecideRequest({orgId,uid:'guest',decision:'reject'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const request=await getDoc(ref(guest.db,`organizations/${orgId}/joinRequests/guest`)),member=await getDoc(ref(guest.db,`organizations/${orgId}/members/guest`));
 assert.equal(member.exists(),request.data().status==='approved');
 if(member.exists())assert.equal(member.data().role,'reviewer');
});

test('forged requests and unrelated user profiles cannot grant access',async()=>{
 const owner=directory('owner'),guest=directory('guest'),attacker=directory('attacker'),anonymous=client(null);const {orgId}=await owner.service.orgCreate({name:'Team'});await owner.service.orgSetVisibility({orgId,discoverable:true});const root=`organizations/${orgId}`;
 assert.equal((await guest.service.orgSearch({name:'unknown'})).organization,null);
 await assertFails(getDoc(ref(anonymous,root)));await assertFails(setDoc(ref(attacker.db,`${root}/joinRequests/guest`),{uid:'guest',email:null,displayName:null,status:'pending',requestedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(attacker.db,'users/guest/organizationRequests/team'),{orgId,name:'Team',created:false}));
 await guest.service.orgRequestJoin({orgId});
 await assertFails(setDoc(ref(attacker.db,`${root}/members/guest`),{uid:'guest',role:'reviewer',approvedBy:'attacker'}));
 await assertFails(updateDoc(ref(attacker.db,`${root}/joinRequests/guest`),{status:'approved',decidedBy:'attacker',decidedAt:serverTimestamp()}));
 await assertFails(deleteDoc(ref(owner.db,root)));
});
