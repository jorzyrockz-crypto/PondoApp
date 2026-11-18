'use strict';
// REVIEW CANDIDATE ONLY. Runs against an isolated demo project; never deploys.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing'),api=require('firebase/firestore');
const {createIntegratedClient}=require('../faculty-fund-spark-client.js');
const projectId='demo-pondo-security',org='org~school release',other='org~other school',testOrg='org~faculty fund test previous';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Start the loopback emulator first');
let env;test.before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.faculty-release-candidate.rules'),'utf8')}})});
test.beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const o of [org,other,testOrg]){await api.setDoc(api.doc(d,`organizations/${o}`),{name:o,createdBy:'owner'});for(const [uid,role] of [['owner','owner'],['ao','disbursing'],['president','reviewer'],['reviewer','reviewer']])await api.setDoc(api.doc(d,`organizations/${o}/members/${uid}`),{uid,role});await api.setDoc(api.doc(d,`organizations/${o}/data/snapshot`),{_syncRevision:1,updatedBy:'owner'});}});});test.after(async()=>env&&env.cleanup());
const db=uid=>env.authenticatedContext(uid).firestore(),ref=(d,o,p)=>api.doc(d,`organizations/${o}/${p}`),client=(uid,o=org)=>createIntegratedClient({db:db(uid),api,orgId:o,uid,useRevision:true,trackRemittanceReleases:true});
async function marker(o,values){await env.withSecurityRulesDisabled(async c=>api.setDoc(ref(c.firestore(),o,'facultyFundRelease/current'),values));}
async function data(uid,o,p){return (await api.getDocFromServer(ref(db(uid),o,p))).data();}

test('no workspace is enabled by default; members cannot enable or forge the control',async()=>{
 const owner=db('owner'),outsider=db('outsider');for(const o of [org,other]){
  await assertFails(api.getDoc(ref(owner,o,'sparkDiscoveryRevision/current')));await assertFails(client('owner',o).assignPresident('president','assignment'));
  await assertFails(api.setDoc(ref(owner,o,'facultyFundRelease/current'),{enabled:true,schema:1}));await assertFails(api.getDoc(ref(outsider,o,'facultyFundRelease/current')));
  assert.ok((await api.getDoc(ref(owner,o,'data/snapshot'))).exists());
 }
});

test('only a privileged enabled, versioned marker opens its own workspace to members',async()=>{
 await marker(org,{enabled:true,schema:1});await marker(other,{enabled:true,schema:2});await marker(testOrg,{enabled:false,schema:1});const owner=db('owner');
 assert.equal((await api.getDoc(ref(owner,org,'facultyFundRelease/current'))).data().enabled,true);await assertFails(api.updateDoc(ref(owner,org,'facultyFundRelease/current'),{schema:2}));await assertFails(api.deleteDoc(ref(owner,org,'facultyFundRelease/current')));
 assert.equal((await api.getDoc(ref(owner,org,'sparkDiscoveryRevision/current'))).exists(),false);await assertFails(api.getDoc(ref(db('outsider'),org,'sparkDiscoveryRevision/current')));
 await assertFails(api.getDoc(ref(owner,other,'sparkDiscoveryRevision/current')));assert.equal((await api.getDoc(ref(owner,testOrg,'sparkDiscoveryRevision/current'))).exists(),false);
});

test('enabled workspace supports integrated handover and expense rules without relaxing role checks',async()=>{
 await marker(org,{enabled:true,schema:1});const owner=client('owner'),ao=client('ao'),pres=client('president');await owner.assignPresident('president','assignment');await ao.createPerson('teacher','Sample');await ao.createPayment('p',{personId:'teacher',absenceDate:'2024-01-01',paymentDate:'2024-01-02',amountCents:25000});await ao.createRemittance('r',['p']);await ao.addPayment('r','p');await ao.submitRemittance('r');
 const viewer=db('reviewer'),revision=(await data('reviewer',org,'sparkDiscoveryRevision/current')).revision,b=api.writeBatch(viewer);b.update(ref(viewer,org,'sparkDiscoveryRemittances/r'),{status:'accepted',acceptedBy:'reviewer',acceptedAt:api.serverTimestamp()});b.set(ref(viewer,org,'sparkDiscoveryWallets/r'),{status:'open',amountCents:25000,unspentCents:25000,acceptedAt:api.serverTimestamp(),revision:0,lastAllocation:null,lastRelease:null});b.set(ref(viewer,org,'sparkDiscoveryRevision/current'),{revision:revision+1,updatedAt:api.serverTimestamp(),updatedBy:'reviewer'});await assertFails(b.commit());
 await pres.accept('r');const wallet=await data('ao',org,'sparkDiscoveryWallets/r');await ao.createExpense('e',{amountCents:10000,description:'Paper',payee:'Shop',occurredAt:wallet.acceptedAt});await ao.allocate('e','r','a',10000);await ao.finalizeExpense('e');assert.equal((await data('ao',org,'sparkDiscoveryWallets/r')).unspentCents,15000);assert.equal((await data('ao',org,'sparkDiscoveryExpenseDrafts/e')).status,'recorded');
 await assertFails(client('reviewer').createPerson('evil','Forbidden'));await assertFails(api.getDoc(ref(db('outsider'),org,'sparkDiscoveryPayments/p')));
});

test('disabling the marker locks financial access without changing ordinary workspace data',async()=>{
 await marker(org,{enabled:true,schema:1});const owner=client('owner'),ao=client('ao');await owner.assignPresident('president','assignment');await ao.createPerson('teacher','Sample');await marker(org,{enabled:false,schema:1});
 await assertFails(api.getDoc(ref(db('ao'),org,'sparkDiscoveryPeople/teacher')));await assertFails(ao.createPerson('other','Other'));assert.ok((await api.getDoc(ref(db('ao'),org,'data/snapshot'))).exists());
 await marker(org,{enabled:true,schema:1});assert.equal((await data('ao',org,'sparkDiscoveryPeople/teacher')).name,'Sample');assert.equal((await data('owner',org,'sparkDiscoveryConfig/current')).presidentUid,'president');
});

test('workspace membership removal cuts off access to an enabled fund',async()=>{
 await marker(org,{enabled:true,schema:1});await client('owner').assignPresident('president','assignment');await env.withSecurityRulesDisabled(async c=>api.deleteDoc(ref(c.firestore(),org,'members/ao')));await assertFails(api.getDoc(ref(db('ao'),org,'sparkDiscoveryConfig/current')));await assertFails(client('ao').createPerson('teacher','No access'));assert.ok((await api.getDoc(ref(db('owner'),org,'data/snapshot'))).exists());
});

test('app contract uses the existing ordinary workspace without changing its regular Pondo snapshot',async()=>{
 const {createSparkApp}=require('../faculty-fund-spark-app.js');
 const modules={createClient:createIntegratedClient,createReader:require('../faculty-fund-spark-read.js').createSparkReader,project:require('../faculty-fund-spark-projection.js').projectFacultySpark,createReadAdapter:require('../faculty-fund-spark-read-adapter.js').createSparkReadAdapter,createWriteAdapter:require('../faculty-fund-spark-write-adapter.js').createSparkWriteAdapter,createReceipts:require('../faculty-fund-spark-receipts.js').createSparkReceiptView,makeReport:require('../faculty-fund-spark-report.js').makeSparkReport,reportCsv:require('../faculty-fund-spark-report.js').sparkReportCsv,makeExport:require('../faculty-fund-spark-export.js').makeSparkDiagnosticExport,createPendingReader:require('../faculty-fund-spark-pending-reader.js').createSparkPendingReader,createPendingInspector:require('../faculty-fund-spark-pending.js').createSparkPendingInspector,createDiscovery:require('../faculty-fund-spark-discovery.js').createSparkDiscovery,createResolver:require('../faculty-fund-spark-discovery-recovery.js').createSparkDiscoveryRecovery,createExpenseResumer:require('../faculty-fund-spark-expense-resume.js').createSparkExpenseResumer,createPagedRecovery:require('../faculty-fund-spark-paged-recovery.js').createSparkPagedRecovery};
 const make=(uid,role)=>createSparkApp({db:db(uid),api,getContext:()=>({uid,role,orgId:org,orgName:'School',memberConfirmed:true,members:[{uid:'president',displayName:'President'}]}),modules,releasePreview:true});const owner=make('owner','owner'),ao=make('ao','disbursing'),president=make('president','reviewer'),input=(n,operation,fields={})=>({orgId:org,requestId:String(n).padStart(32,'0'),operation,...fields});
 // Until explicitly enabled, neither the app read nor a mutation succeeds.
 await assert.rejects(owner.read({orgId:org,view:'state'}),/not enabled/);await marker(org,{enabled:true,schema:1});
 await owner.transition(input(1,'assignPresident',{presidentUid:'president'}));const person=await ao.transition(input(2,'registerPerson',{name:'Teacher'}));const payment=await ao.transition(input(3,'recordPayment',{personId:person.personId,absenceDate:'2024-01-01',paymentDate:'2024-01-02',amountCents:25000}));const remit=await ao.transition(input(4,'submitRemittance',{paymentIds:[payment.paymentId]}));await president.transition(input(5,'accept',{remittanceId:remit.remittanceId}));
 let state=await ao.read({orgId:org,view:'state'});assert.equal(state.ledger.balanceCents,25000);assert.equal(state.ledger.spendableCents,25000);assert.equal(state.state.people[0].name,'Teacher');const w=await data('ao',org,'sparkDiscoveryWallets/'+remit.remittanceId);await ao.transition(input(6,'recordExpense',{amountCents:10000,description:'Paper',payee:'Shop',reference:'',occurredAt:new Date(Math.ceil(w.acceptedAt.toMillis())).toISOString()}));state=await ao.read({orgId:org,view:'state'});assert.equal(state.ledger.balanceCents,15000);assert.equal(state.ledger.spentCents,10000);
 // Regular Pondo data continues to live in the same workspace, unchanged;
 // Faculty Fund financial documents remain separate from that editable data.
 assert.deepEqual(await data('owner',org,'data/snapshot'),{_syncRevision:1,updatedBy:'owner'});assert.equal((await data('owner',org,'facultyFundRelease/current')).enabled,true);
});

test('the existing test workspace remains accessible without a release marker',async()=>{
 const owner=client('owner',testOrg),ao=client('ao',testOrg);await owner.assignPresident('president','assignment');await ao.createPerson('teacher','Existing test record');assert.equal((await data('ao',testOrg,'sparkDiscoveryPeople/teacher')).name,'Existing test record');await assertFails(api.getDoc(ref(db('outsider'),testOrg,'sparkDiscoveryPeople/teacher')));await assertFails(api.setDoc(ref(db('owner'),testOrg,'facultyFundRelease/current'),{enabled:true,schema:1}));
});
