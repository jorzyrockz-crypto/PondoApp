'use strict';
// Local Firestore emulator only. The published test rules are not production
// financial rules; this checks workspace isolation and a real-account workflow.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const api=require('firebase/firestore');
const {createIntegratedClient}=require('../faculty-fund-spark-client.js');
const projectId='demo-pondo-security',testOrg='org~faculty fund test example',normalOrg='org~ordinary workspace';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback emulator first');
let env;
test.before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.faculty-test.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{let db=c.firestore();for(const org of [testOrg,normalOrg])for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['reviewer','reviewer']])await api.setDoc(api.doc(db,`organizations/${org}/members/${uid}`),{uid,role});});});
test.after(async()=>env&&env.cleanup());
const db=uid=>env.authenticatedContext(uid).firestore();
const client=(uid,orgId=testOrg)=>createIntegratedClient({db:db(uid),api,orgId,uid,useRevision:true,trackRemittanceReleases:true});
const ref=(uid,org,p)=>api.doc(db(uid),`organizations/${org}/${p}`);
test('test workspace permits the intended multi-account handover but denies nonmembers and normal workspaces',async()=>{
 const owner=client('owner'),ao=client('ao'),president=client('president');
 await assertFails(client('owner',normalOrg).assignPresident('president','assignment'));
 await assertFails(api.getDoc(ref('outsider',testOrg,'sparkDiscoveryRevision/current')));
 await assertFails(api.getDoc(ref('owner',normalOrg,'sparkDiscoveryRevision/current')));
 await owner.assignPresident('president','assignment');await ao.createPerson('sample','Sample Teacher');
 await ao.createPayment('payment',{personId:'sample',absenceDate:'2024-01-01',paymentDate:'2024-01-02',amountCents:25000});
 await ao.createRemittance('remittance',['payment']);await ao.addPayment('remittance','payment');await ao.submitRemittance('remittance');
 await assert.rejects(client('reviewer').accept('remittance'),/cannot be accepted/);
 const reviewer=db('reviewer'),revision=(await api.getDoc(api.doc(reviewer,`organizations/${testOrg}/sparkDiscoveryRevision/current`))).data().revision;
 const forged=api.writeBatch(reviewer);
 forged.update(api.doc(reviewer,`organizations/${testOrg}/sparkDiscoveryRemittances/remittance`),{status:'accepted',acceptedBy:'reviewer',acceptedAt:api.serverTimestamp()});
 forged.set(api.doc(reviewer,`organizations/${testOrg}/sparkDiscoveryWallets/remittance`),{status:'open',amountCents:25000,unspentCents:25000,acceptedAt:api.serverTimestamp(),revision:0,lastAllocation:null,lastRelease:null});
 forged.set(api.doc(reviewer,`organizations/${testOrg}/sparkDiscoveryRevision/current`),{revision:revision+1,updatedAt:api.serverTimestamp(),updatedBy:'reviewer'});
 await assertFails(forged.commit());await president.accept('remittance');
 const remittance=(await api.getDoc(ref('ao',testOrg,'sparkDiscoveryRemittances/remittance'))).data();
 assert.equal(remittance.status,'accepted');assert.equal(remittance.acceptedBy,'president');assert.ok(remittance.acceptedAt);
 const wallet=(await api.getDoc(ref('ao',testOrg,'sparkDiscoveryWallets/remittance'))).data();assert.equal(wallet.unspentCents,25000);
 await ao.confirmPrint('member','payment','remittance');await ao.confirmPrint('remittance','remittance');
 await ao.createExpense('expense',{amountCents:10000,description:'Sample expense',payee:'Sample shop',occurredAt:wallet.acceptedAt});
 await ao.allocate('expense','remittance','allocation',10000);await ao.finalizeExpense('expense');
 const after=(await api.getDoc(ref('ao',testOrg,'sparkDiscoveryWallets/remittance'))).data();assert.equal(after.unspentCents,15000);
});
test('test rules preserve ordinary workspace discovery, membership, and snapshot access',async()=>{
 const user='owner';
 await env.withSecurityRulesDisabled(async c=>{
  const admin=c.firestore();
  await api.setDoc(api.doc(admin,`users/${user}`),{orgMemberships:[normalOrg,testOrg],activeOrganizationId:normalOrg});
  for(const org of [normalOrg,testOrg]){
   await api.setDoc(api.doc(admin,`organizations/${org}`),{name:org,createdBy:user});
   await api.setDoc(api.doc(admin,`organizations/${org}/data/snapshot`),{_syncRevision:1,updatedBy:user});
  }
 });
 const owner=db(user),viewer=db('reviewer'),outsider=db('outsider');
 const profile=await api.getDoc(api.doc(owner,`users/${user}`));assert.deepEqual(profile.data().orgMemberships,[normalOrg,testOrg]);
 await api.setDoc(api.doc(owner,`users/${user}`),{activeOrganizationId:testOrg},{merge:true});
 for(const org of [normalOrg,testOrg]){
  assert.ok((await api.getDoc(api.doc(owner,`organizations/${org}`))).exists());
  assert.ok((await api.getDoc(api.doc(owner,`organizations/${org}/members/${user}`))).exists());
  assert.equal((await api.getDocs(api.collection(owner,`organizations/${org}/members`))).size,4);
  assert.ok((await api.getDoc(api.doc(owner,`organizations/${org}/data/snapshot`))).exists());
  assert.ok((await api.getDoc(api.doc(viewer,`organizations/${org}/data/snapshot`))).exists());
  await assertFails(api.getDoc(api.doc(outsider,`organizations/${org}`)));
  await assertFails(api.getDoc(api.doc(outsider,`organizations/${org}/data/snapshot`)));
 }
});
test('test rules preserve shared appearance owner restriction outside and inside test workspaces',async()=>{
 await env.withSecurityRulesDisabled(async c=>{const admin=c.firestore();for(const org of [testOrg,normalOrg])await api.setDoc(api.doc(admin,`organizations/${org}`),{name:org,createdBy:'owner'});});
 for(const org of [testOrg,normalOrg]){
  await api.updateDoc(api.doc(db('owner'),`organizations/${org}`),{teamColor:'violet',teamIcon:'star'});
  await assertFails(api.updateDoc(api.doc(db('reviewer'),`organizations/${org}`),{teamColor:'rose',teamIcon:'heart'}));
  await assertFails(api.updateDoc(api.doc(db('owner'),`organizations/${org}`),{teamColor:'invalid',teamIcon:'star'}));
 }
});
test('test rules allow an atomic private removal notice without granting workspace access',async()=>{
 await env.withSecurityRulesDisabled(async c=>{const admin=c.firestore();await api.setDoc(api.doc(admin,`organizations/${normalOrg}`),{name:'Normal Workspace'});});
 const owner=db('owner'),reviewer=db('reviewer'),notice='users/reviewer/teamNotices/n1',member=`organizations/${normalOrg}/members/reviewer`;
 const payload={kind:'removed',orgId:normalOrg,orgName:'Normal Workspace',actorUid:'owner',createdAt:api.serverTimestamp(),read:false};
 await assertFails(api.setDoc(api.doc(owner,notice),payload));
 const b=api.writeBatch(owner);b.set(api.doc(owner,notice),payload);b.delete(api.doc(owner,member));await b.commit();
 assert.equal((await api.getDoc(api.doc(reviewer,notice))).data().kind,'removed');await assertFails(api.getDoc(api.doc(reviewer,`organizations/${normalOrg}`)));
});
