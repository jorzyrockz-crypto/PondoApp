'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFacultyFundRecoveryService}=require('../faculty-fund-functions/faculty-fund-recovery.cjs');
const {createFacultyFundService}=require('../faculty-fund-functions/faculty-fund-service.cjs');
function memory(){const data=new Map();let queue=Promise.resolve();return {data,doc:path=>({path}),runTransaction(fn){const task=queue.then(async()=>{const writes=[];const tx={get:async ref=>({exists:data.has(ref.path),data:()=>structuredClone(data.get(ref.path))}),set:(ref,value)=>writes.push(['set',ref.path,structuredClone(value)]),create:(ref,value)=>writes.push(['create',ref.path,structuredClone(value)])};const result=await fn(tx);for(const [kind,path] of writes)if(kind==='create'&&data.has(path))throw Error('already exists');for(const [,path,value] of writes)data.set(path,value);return result;});queue=task.catch(()=>{});return task}};}
async function setup(){const db=memory(),root='organizations/school';db.data.set(`${root}/members/owner`,{uid:'owner',role:'owner'});db.data.set(`${root}/members/ao`,{uid:'ao',role:'disbursing'});db.data.set(`${root}/members/president`,{uid:'president',role:'reviewer'});const clock=()=>new Date('2026-11-09T10:00:00.000Z'),work=createFacultyFundService({db,clock}),recover=createFacultyFundRecoveryService({db,clock});let id=0;const call=(uid,operation,fields={})=>work({auth:{uid},input:{orgId:'school',operation,requestId:String(++id).padStart(32,'0'),...fields}}),rec=(uid,operation,fields={},requestId=String(++id).padStart(32,'0'))=>recover({auth:{uid},input:{orgId:'school',operation,requestId,...fields}});await call('owner','assignPresident',{presidentUid:'president'});return {db,root,call,rec};}
test('server-only backup is owner-scoped, idempotent and contains a revision',async()=>{
 const e=await setup();await assert.rejects(e.rec('ao','saveBackup'),/owner/);const id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',b=await e.rec('owner','saveBackup',{},id),again=await e.rec('owner','saveBackup',{},id);assert.equal(b.revision,1);assert.equal(b.backupId,again.backupId);assert.equal(again.replayed,true);assert.equal(e.db.data.get(`${e.root}/facultyFundBackups/${b.backupId}`).state.audit[0].kind,'president-assigned');
 await assert.rejects(e.rec('owner','restoreMissing',{backupId:b.backupId},id),/different operation/);
});
test('restore is allowed only for missing state at the exact saved revision',async()=>{
 const e=await setup(),b=await e.rec('owner','saveBackup');await assert.rejects(e.rec('owner','restoreMissing',{backupId:b.backupId}),/exists/);e.db.data.delete(`${e.root}/facultyFund/state`);const result=await e.rec('owner','restoreMissing',{backupId:b.backupId});assert.equal(result.revision,2);const s=e.db.data.get(`${e.root}/facultyFund/state`);assert.equal(s.audit.at(-1).kind,'state-restored-from-backup');assert.equal(e.db.data.get(`${e.root}/facultyFund/config`).presidentUid,'president');
});
test('stale backups, missing control, changed workspace and forged uploads cannot restore',async()=>{
 const e=await setup(),b=await e.rec('owner','saveBackup');const person=await e.call('ao','registerPerson',{name:'Teacher'});await e.call('ao','recordPayment',{personId:person.personId,absenceDate:'2026-11-01',paymentDate:'2026-11-09'});e.db.data.delete(`${e.root}/facultyFund/state`);await assert.rejects(e.rec('owner','restoreMissing',{backupId:b.backupId}),/latest verified/);assert.equal(e.db.data.has(`${e.root}/facultyFund/state`),false);await assert.rejects(e.rec('owner','restoreMissing',{backupId:'f'.repeat(64),state:{payments:[]}}),/not found/);e.db.data.delete(`${e.root}/facultyFund/control`);await assert.rejects(e.rec('owner','restoreMissing',{backupId:b.backupId}),/revision/);
});
test('missing control or state blocks both changes and replay rather than inventing a fresh ledger',async()=>{
 const e=await setup();e.db.data.delete(`${e.root}/facultyFund/state`);await assert.rejects(e.call('ao','recordPayment',{personId:'teacher',memberName:'Teacher',absenceDate:'2026-11-01',paymentDate:'2026-11-09'}),/recovery is required/);assert.equal(e.db.data.has(`${e.root}/facultyFund/state`),false);
});
test('restoring with missing config never reinstates a past assignment',async()=>{
 const e=await setup(),b=await e.rec('owner','saveBackup');e.db.data.delete(`${e.root}/facultyFund/state`);e.db.data.delete(`${e.root}/facultyFund/config`);await e.rec('owner','restoreMissing',{backupId:b.backupId});assert.equal(e.db.data.has(`${e.root}/facultyFund/config`),false);
});
test('both missing data and control with remaining assignment does not create a new empty fund',async()=>{
 const e=await setup();e.db.data.delete(`${e.root}/facultyFund/state`);e.db.data.delete(`${e.root}/facultyFund/control`);await assert.rejects(e.call('ao','registerPerson',{name:'Teacher'}),/recovery is required/);assert.equal(e.db.data.has(`${e.root}/facultyFund/state`),false);
});
