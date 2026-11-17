'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {createFacultyFundReadService}=require('../faculty-fund-functions/faculty-fund-read.cjs');
function setup(){const data=new Map(),db={doc:path=>({path}),runTransaction:async fn=>fn({get:async ref=>({exists:data.has(ref.path),data:()=>structuredClone(data.get(ref.path))})})},root='organizations/school';data.set(root,{name:'School'});for(const [uid,role] of [['owner','owner'],['reviewer','reviewer']])data.set(root+'/members/'+uid,{uid,role});return {data,root,read:createFacultyFundReadService({db})};}
test('member-only state read distinguishes empty fund from missing data requiring recovery',async()=>{
 const e=setup(),result=await e.read({auth:{uid:'reviewer'},input:{orgId:'school',view:'state'}});assert.equal(result.revision,0);assert.equal(result.ledger.balanceCents,0);await assert.rejects(e.read({auth:{uid:'outsider'},input:{orgId:'school',view:'state'}}),x=>x.code==='permission-denied');e.data.set(e.root+'/facultyFund/control',{revision:1});await assert.rejects(e.read({auth:{uid:'owner'},input:{orgId:'school',view:'state'}}),/recovery/);
});
test('report reads use server state and only collectors can print',async()=>{
 const e=setup();e.data.set(e.root+'/facultyFund/state',{payments:[],expenses:[],remittances:[],audit:[]});e.data.set(e.root+'/facultyFund/control',{revision:1});const report=await e.read({auth:{uid:'reviewer'},input:{orgId:'school',view:'report',state:{payments:[{amountCents:5}]}}});assert.equal(report.report.closingCents,0);await assert.rejects(e.read({auth:{uid:'reviewer'},input:{orgId:'school',view:'memberReceipts',paymentIds:['fake']}}),x=>x.code==='permission-denied');
});
test('callable entry is a separate disabled-by-default codebase',()=>{
 const fs=require('node:fs'),config=JSON.parse(fs.readFileSync('firebase.json')),source=fs.readFileSync('faculty-fund-functions/index.cjs','utf8');assert.equal(config.functions[0].source,'faculty-fund-functions');assert.equal(config.functions[0].codebase,'faculty-fund');assert.match(source,/PONDO_FACULTY_FUND_ENABLED!==\x27true\x27/);assert.doesNotMatch(source,/publicReport/);
});
