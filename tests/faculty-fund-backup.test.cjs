'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {createFacultyFundBackupService,verifyFacultyBackup}=require('../faculty-fund-functions/faculty-fund-backup.cjs');
function env(){const data=new Map(),db={doc:path=>({path}),runTransaction:async fn=>fn({get:async ref=>({exists:data.has(ref.path),data:()=>structuredClone(data.get(ref.path))})})};const root='organizations/org~school';data.set(root+'/members/owner',{uid:'owner',role:'owner'});data.set(root+'/members/ao',{uid:'ao',role:'disbursing'});data.set(root+'/facultyFund/config',{presidentUid:'p'});data.set(root+'/facultyFund/state',{payments:[],expenses:[],remittances:[],audit:[]});return {data,root,read:createFacultyFundBackupService({db,clock:()=>new Date('2026-11-09T12:00:00.000Z')})};}
test('only a current owner exports a workspace-scoped consistent snapshot',async()=>{
 const e=env(),backup=await e.read({auth:{uid:'owner'},orgId:'org~school'});assert.equal(backup.payload.workspaceId,'org~school');assert.equal(backup.payload.exportedByUid,'owner');assert.equal(backup.payload.ledgerCheck,'passed');assert.equal(backup.payload.exportedAt,'2026-11-09T12:00:00.000Z');assert.equal(verifyFacultyBackup(backup),true);
 await assert.rejects(e.read({auth:{uid:'ao'},orgId:'org~school'}),/Only a current workspace owner/);await assert.rejects(e.read({auth:null,orgId:'org~school'}),/authentication/);await assert.rejects(e.read({auth:{uid:'owner'},orgId:'../other'}),/workspace/);e.data.delete(e.root+'/members/owner');await assert.rejects(e.read({auth:{uid:'owner'},orgId:'org~school'}),/owner/);
});
test('checksum catches accidental modification but is not a security signature',async()=>{
 const e=env(),b=await e.read({auth:{uid:'owner'},orgId:'org~school'});b.payload.state.audit.push({kind:'changed'});assert.equal(verifyFacultyBackup(b),false);assert.equal(verifyFacultyBackup({format:b.format,payload:b.payload,checksum:'bogus'}),false);
});
test('a damaged ledger can still be exported with a warning',async()=>{
 const e=env();e.data.set(e.root+'/facultyFund/state',{payments:[],expenses:[{id:'e',date:'2026-11-01',occurredAt:'2026-11-01T00:00:00.000Z',amountCents:500}],remittances:[],audit:[]});const backup=await e.read({auth:{uid:'owner'},orgId:'org~school'});assert.equal(backup.payload.ledgerCheck,'failed');assert.equal(backup.payload.state.expenses.length,1);assert.equal(verifyFacultyBackup(backup),true);
});
