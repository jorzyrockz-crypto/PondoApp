const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('functions/index.cjs','utf8');
function setup(seed={}){
 const data=new Map(Object.entries(seed)),calls=[];let randomCounter=0;
 const db={doc:path=>({path}),runTransaction:async fn=>{
  const changes=[];let writing=false;
  const tx={get:async ref=>{if(writing)throw Error('Read after write');let value=data.get(ref.path);return {exists:value!==undefined,data:()=>value}},set:(ref,value)=>{writing=true;changes.push(()=>data.set(ref.path,value))},update:(ref,value)=>{writing=true;changes.push(()=>data.set(ref.path,{...data.get(ref.path),...value}))},delete:ref=>{writing=true;changes.push(()=>data.delete(ref.path))}};
  let result=await fn(tx);for(const op of changes)op();return result;
 }};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
 const imports={'firebase-functions/v2/https':{onCall:fn=>fn,HttpsError},'firebase-functions/v2/firestore':{onDocumentWritten:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/firestore':{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>({serverTimestamp:true})}},'node:crypto':{createHash:require('node:crypto').createHash,randomBytes:()=>({toString:()=> (++randomCounter).toString(16).padStart(48,'0')})},'./projection.js':require('../functions/projection.js'),'./validate.cjs':require('../functions/validate.cjs')};
 let exports={};vm.runInNewContext(source,{exports,require:name=>{if(!(name in imports))throw Error(name);return imports[name]},console,Buffer});return {api:exports,data,calls};
}
async function enable(api,req){const preview=await api.publicReportPreview(req);return api.publicReportEnable({...req,data:{...req.data,previewDigest:preview.previewDigest}})}
const snapshot=()=>({funds:[{id:'f',name:'private',initialAmount:10}],txs:[{id:'t',fundId:'f',type:'OUT',amount:2,date:'2026-01-01',description:'Alice'}],projects:[],allocations:[],contributionActivities:[],contributors:[],contributionPayments:[]});
const selection={funds:true,projects:false,contributions:false};
const deviceId='0123456789abcdef0123456789abcdef';
const owner={auth:{uid:'owner'},data:{orgId:'school',selection,currency:'PHP'}};
test('only owner can enable a team report; output never contains private values',async()=>{
 let t=setup({'organizations/school/members/owner':{role:'owner'},'organizations/school/data/snapshot':snapshot()});
 await assert.rejects(enable(t.api,{...owner,auth:{uid:'intruder'}}),{code:'permission-denied'});
 let response=await enable(t.api,owner);let publicDoc=t.data.get('publicReports/'+response.id);
 assert.equal(JSON.stringify(publicDoc).includes('Alice'),false);assert.equal(JSON.stringify(publicDoc).includes('private'),false);
 assert.equal(publicDoc.report.funds[0].balanceCents,800);
});
test('team refresh reads the latest snapshot and cannot resurrect a disabled report',async()=>{
 let t=setup({'organizations/school/members/owner':{role:'owner'},'organizations/school/data/snapshot':snapshot()});let share=await enable(t.api,owner);
 let newest=snapshot();newest.txs[0].amount=5;t.data.set('organizations/school/data/snapshot',newest);
 await t.api.publicReportTeamRefresh({params:{orgId:'school'}});assert.equal(t.data.get('publicReports/'+share.id).report.funds[0].balanceCents,500);
 await t.api.publicReportDisable(owner);await t.api.publicReportTeamRefresh({params:{orgId:'school'}});assert.equal(t.data.has('publicReports/'+share.id),false);
});
test('owner membership removal unpublishes on the membership trigger',async()=>{
 let t=setup({'organizations/school/members/owner':{role:'owner'},'organizations/school/data/snapshot':snapshot()});let share=await enable(t.api,owner);
 t.data.delete('organizations/school/members/owner');await t.api.publicReportMembershipRefresh({params:{orgId:'school',memberId:'owner'}});assert.equal(t.data.has('publicReports/'+share.id),false);
});
test('personal publishing rejects private fields, wrong account and stale revisions',async()=>{
 let t=setup(),report=require('../functions/projection.js').buildPublicReport(snapshot(),selection),req={auth:{uid:'one'},data:{orgId:null,deviceId,selection,currency:'PHP',report}};
 let share=await enable(t.api,req);
 await assert.rejects(t.api.publicReportUpdatePersonal({auth:{uid:'one'},data:{deviceId,id:share.id,revision:1,report:{...report,notes:'secret'}}}),{code:'invalid-argument'});
 await assert.rejects(t.api.publicReportUpdatePersonal({auth:{uid:'two'},data:{deviceId,id:share.id,revision:1,report}}),{code:'failed-precondition'});
 await t.api.publicReportUpdatePersonal({auth:{uid:'one'},data:{deviceId,id:share.id,revision:2,report}});
 await assert.rejects(t.api.publicReportUpdatePersonal({auth:{uid:'one'},data:{deviceId,id:share.id,revision:1,report}}),{code:'aborted'});
});

test('personal reports are isolated per device even for the same account',async()=>{
 let t=setup(),report=require('../functions/projection.js').buildPublicReport(snapshot(),selection);
 await enable(t.api,{auth:{uid:'one'},data:{deviceId,selection,currency:'PHP',report}});
 let other=await t.api.publicReportStatus({auth:{uid:'one'},data:{deviceId:'abcdef0123456789abcdef0123456789'}});
 assert.equal(other.enabled,false);
 await assert.rejects(t.api.publicReportStatus({auth:{uid:'one'},data:{}}),{code:'invalid-argument'});
});

test('reconfirming a personal share invalidates the old link and delayed updates',async()=>{
 let t=setup(),report=require('../functions/projection.js').buildPublicReport(snapshot(),selection);
 let req={auth:{uid:'one'},data:{deviceId,selection,currency:'PHP',report}};
 let first=await enable(t.api,req),second=await enable(t.api,req);
 assert.notEqual(first.id,second.id);assert.equal(t.data.has('publicReports/'+first.id),false);
 await assert.rejects(t.api.publicReportUpdatePersonal({auth:req.auth,data:{deviceId,id:first.id,revision:99,report}}),{code:'permission-denied'});
 assert.equal(t.data.has('publicReports/'+second.id),true);
});

test('preview is private and publishing fails if the synced team report changed after review',async()=>{
 let t=setup({'organizations/school/members/owner':{role:'owner'},'organizations/school/data/snapshot':snapshot()});
 await assert.rejects(t.api.publicReportPreview({...owner,auth:{uid:'intruder'}}),{code:'permission-denied'});
 const preview=await t.api.publicReportPreview(owner);
 assert.equal([...t.data.keys()].some(k=>k.startsWith('publicReports/')),false);
 assert.equal(JSON.stringify(preview).includes('Alice'),false);
 let updated=snapshot();updated.txs[0].amount=3;t.data.set('organizations/school/data/snapshot',updated);
 await assert.rejects(t.api.publicReportEnable({...owner,data:{...owner.data,previewDigest:preview.previewDigest}}),{code:'failed-precondition'});
 assert.equal([...t.data.keys()].some(k=>k.startsWith('publicReports/')),false);
 let fresh=await t.api.publicReportPreview(owner);
 let published=await t.api.publicReportEnable({...owner,data:{...owner.data,previewDigest:fresh.previewDigest}});
 assert.equal(t.data.get('publicReports/'+published.id).report.funds[0].balanceCents,700);
});
test('preview confirmation binds personal data, selected views and currency',async()=>{
 let t=setup(),report=require('../functions/projection.js').buildPublicReport(snapshot(),selection);
 const req={auth:{uid:'one'},data:{deviceId,selection,currency:'PHP',report}};
 const preview=await t.api.publicReportPreview(req);
 await assert.rejects(t.api.publicReportEnable({...req,data:{...req.data,currency:'USD',previewDigest:preview.previewDigest}}),{code:'failed-precondition'});
 await assert.rejects(t.api.publicReportEnable(req),{code:'failed-precondition'});
 assert.equal([...t.data.keys()].some(k=>k.startsWith('publicReports/')),false);
});
