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
test('test rules allow only bounded public organization suggestions',async()=>{
 await env.withSecurityRulesDisabled(async c=>{const admin=c.firestore();await api.setDoc(api.doc(admin,`organizations/${testOrg}`),{name:'Faculty Fund Test Example',discoverable:true});await api.setDoc(api.doc(admin,`organizations/${normalOrg}`),{name:'Ordinary Workspace',discoverable:false});});
 const outsider=db('outsider');const q=api.query(api.collection(outsider,'organizations'),api.where('discoverable','==',true),api.orderBy(api.documentId()),api.startAt('org~'),api.limit(10));
 const snap=await api.getDocs(q);assert.deepEqual(snap.docs.map(d=>d.id),[testOrg]);
 await assertFails(api.getDocs(api.query(api.collection(outsider,'organizations'),api.limit(10))));
});

test('members can listen to bounded Faculty Fund notification collections; outsiders cannot',async()=>{
 const president=db('president'),outsider=db('outsider');
 for(const path of ['sparkDiscoveryRemittances','sparkDiscoveryCorrections']){
  const q=d=>api.query(api.collection(d,`organizations/${testOrg}/${path}`),api.limit(1001));
  const snap=await new Promise((resolve,reject)=>{let unsub=()=>{};unsub=api.onSnapshot(q(president),{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache&&!s.metadata.hasPendingWrites){unsub();resolve(s);}},reject)});
  assert.equal(snap.size,0);await assertFails(api.getDocs(q(outsider)));
 }
});

test('confirmed Firestore events notify the President and AO across accounts',async()=>{
 const {processSparkFacultyNotifications}=require('../faculty-fund-notifications.js');const unsubs=[];
 function watch(uid,role){
  const state={uid,orgId:testOrg,role,memberConfirmed:true},events=[],values=new Map();let remits=null,corrections=null;const io={storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},push:n=>{events.push(n);check();return n}};let waiters=[];
  function check(){for(const w of [...waiters])if(w.condition()){waiters=waiters.filter(x=>x!==w);clearTimeout(w.timer);w.resolve();}}
  function until(condition){if(condition())return Promise.resolve();return new Promise((resolve,reject)=>{const w={condition,resolve,timer:setTimeout(()=>reject(Error('notification listener timed out')),15000)};waiters.push(w);});}
  function received(path,assign){const q=api.query(api.collection(db(uid),`organizations/${testOrg}/${path}`),api.limit(1001));unsubs.push(api.onSnapshot(q,{includeMetadataChanges:true},s=>{if(s.metadata.fromCache||s.metadata.hasPendingWrites)return;const rows=s.docs.map(d=>({...d.data(),id:d.id}));assign(rows);if(remits&&corrections)processSparkFacultyNotifications(remits,corrections,state,{presidentUid:'president'},io);check();}));}
  received('sparkDiscoveryRemittances',v=>remits=v);received('sparkDiscoveryCorrections',v=>corrections=v);return {events,ready:()=>until(()=>!!remits&&!!corrections),sawPending:()=>until(()=>remits?.some(r=>r.id==='r'&&r.status==='pending')),until};
 }
 try{
  const owner=client('owner'),ao=client('ao'),president=client('president');await owner.assignPresident('president','assignment');const p=watch('president','reviewer'),a=watch('ao','disbursing');await Promise.all([p.ready(),a.ready()]);
  await ao.createPerson('sample','Sample');await ao.createPayment('p',{personId:'sample',absenceDate:'2024-01-01',paymentDate:'2024-01-02',amountCents:25000});await ao.createRemittance('r',['p']);await ao.addPayment('r','p');await ao.submitRemittance('r');await p.until(()=>p.events.some(n=>/awaiting acceptance/.test(n.title)));await a.sawPending();
  await president.accept('r');await a.until(()=>a.events.some(n=>/remittance accepted/.test(n.title)));await ao.requestCorrection('c','r','Sample correction');await p.until(()=>p.events.some(n=>/correction awaiting review/.test(n.title)));
  assert.equal(p.events.filter(n=>/awaiting acceptance/.test(n.title)).length,1);assert.equal(a.events.filter(n=>/remittance accepted/.test(n.title)).length,1);
 }finally{unsubs.forEach(u=>u());}
});

test('scoped owner diagnostic export reads a reconciled snapshot and is not a restore file',async()=>{
 const {createSparkApp}=require('../faculty-fund-spark-app.js'),{verifySparkDiagnosticExport}=require('../faculty-fund-spark-export.js');
 const modules={createClient:createIntegratedClient,createReader:require('../faculty-fund-spark-read.js').createSparkReader,project:require('../faculty-fund-spark-projection.js').projectFacultySpark,createReadAdapter:require('../faculty-fund-spark-read-adapter.js').createSparkReadAdapter,createWriteAdapter:require('../faculty-fund-spark-write-adapter.js').createSparkWriteAdapter,createReceipts:require('../faculty-fund-spark-receipts.js').createSparkReceiptView,makeReport:require('../faculty-fund-spark-report.js').makeSparkReport,reportCsv:require('../faculty-fund-spark-report.js').sparkReportCsv,makeExport:require('../faculty-fund-spark-export.js').makeSparkDiagnosticExport,createPendingReader:require('../faculty-fund-spark-pending-reader.js').createSparkPendingReader,createPendingInspector:require('../faculty-fund-spark-pending.js').createSparkPendingInspector,createDiscovery:require('../faculty-fund-spark-discovery.js').createSparkDiscovery,createResolver:require('../faculty-fund-spark-discovery-recovery.js').createSparkDiscoveryRecovery,createExpenseResumer:require('../faculty-fund-spark-expense-resume.js').createSparkExpenseResumer,createPagedRecovery:require('../faculty-fund-spark-paged-recovery.js').createSparkPagedRecovery};
 await client('owner').assignPresident('president','assignment');const ao=client('ao');await ao.createPerson('teacher','Sample');await ao.createPayment('p',{personId:'teacher',absenceDate:'2024-01-01',paymentDate:'2024-01-02',amountCents:25000});
 const make=(uid,role)=>createSparkApp({db:db(uid),api,getContext:()=>({uid,role,orgId:testOrg,memberConfirmed:true}),modules});const result=await make('owner','owner').export({orgId:testOrg});assert.match(result.notice,/not an authenticated backup/);assert.equal(result.payload.summary.receivedCents,25000);assert.equal(result.payload.records.payments[0].memberName,'Sample');assert.equal(await verifySparkDiagnosticExport(result),true);
 result.payload.records.payments[0].amountCents=1;assert.equal(await verifySparkDiagnosticExport(result),false);await assert.rejects(make('reviewer','reviewer').export({orgId:testOrg}),/owner/);
});
