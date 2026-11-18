'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {processFacultyNotifications:process}=require('../faculty-fund-notifications.js');
function env(uid='president',orgId='school'){const m=new Map(),events=[],state={uid,orgId,role:'reviewer',memberConfirmed:true},io={storage:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)},push:n=>{events.push(n);return n}};return {m,events,state,io}}
const pending={id:'r',status:'pending',presidentUid:'president',submittedByUid:'ao'};
test('pending remittance notifies only its President once without private financial details',()=>{
 const e=env('president','school-a');process({remittances:[pending]},e.state,{presidentUid:'president'},e.io);process({remittances:[pending]},e.state,{presidentUid:'president'},e.io);assert.equal(e.events.length,1);assert.equal(e.events[0].action.tab,'funds');assert.equal(e.events[0].action.facultyFund,true);assert.equal(e.events[0].action.facultyPage,'handovers');assert.doesNotMatch(JSON.stringify(e.events),/250|absence|Teacher/);
 const other=env('other','school-a');process({remittances:[pending]},other.state,{presidentUid:'president'},other.io);assert.equal(other.events.length,0);
});
test('AO receives later acceptance, while first snapshot does not replay old decisions',()=>{
 const e=env('ao','school-b');process({remittances:[pending]},e.state,{presidentUid:'president'},e.io);const accepted={...pending,status:'accepted',acceptedByUid:'president',acceptedAt:'t'};process({remittances:[accepted]},e.state,{presidentUid:'president'},e.io);process({remittances:[accepted]},e.state,{presidentUid:'president'},e.io);assert.equal(e.events.length,1);assert.match(e.events[0].title,/accepted/);
 const fresh=env('ao2','school-b');process({remittances:[{...accepted,submittedByUid:'ao2'}]},fresh.state,{presidentUid:'president'},fresh.io);assert.equal(fresh.events.length,0);
});
test('unconfirmed membership, other workspace and failed delivery do not misdirect or lose alerts',()=>{
 const e=env('president','school-c');e.state.memberConfirmed=false;process({remittances:[pending]},e.state,{presidentUid:'president'},e.io);assert.equal(e.events.length,0);e.state.memberConfirmed=true;let fail=true;e.io.push=n=>{if(fail)return null;e.events.push(n);return n};process({remittances:[pending]},e.state,{presidentUid:'president'},e.io);fail=false;process({remittances:[pending]},e.state,{presidentUid:'president'},e.io);assert.equal(e.events.length,1);assert.equal(e.events[0].orgId,'school-c');
});
test('current assigned President receives pending correction without the reason',()=>{
 const e=env('president','school-d'),r={...pending,status:'accepted',acceptedAt:'x',acceptedByUid:'president',voidRequest:{requestedAt:'y',requestedByUid:'ao',reason:'Sensitive reason'}};process({remittances:[r]},e.state,{presidentUid:'president'},e.io);assert.equal(e.events.length,1);assert.match(e.events[0].title,/correction/);assert.doesNotMatch(JSON.stringify(e.events),/Sensitive reason/);
});

test('Spark remittances notify the President and then their AO, with no repeats',()=>{
 const {processSparkFacultyNotifications:spark}=require('../faculty-fund-notifications.js');const ts=n=>({toMillis:()=>n});
 const president=env('president','spark-school-x'),ao=env('ao','spark-school-x');let toast=0;president.io.toast=()=>toast++;
 const pending={id:'r2',status:'pending',presidentUid:'president',createdBy:'ao',submittedAt:ts(10)};
 spark([pending],[],president.state,{presidentUid:'president'},president.io);spark([pending],[],ao.state,{presidentUid:'president'},ao.io);
 assert.equal(president.events.length,1);assert.equal(toast,1);assert.equal(ao.events.length,0);
 const accepted={...pending,status:'accepted',acceptedBy:'president',acceptedAt:ts(20)};
 spark([accepted],[],ao.state,{presidentUid:'president'},ao.io);spark([accepted],[],ao.state,{presidentUid:'president'},ao.io);assert.equal(ao.events.length,1);assert.match(ao.events[0].title,/accepted/);
});
test('Spark correction notifications require a matching pending correction',()=>{
 const {processSparkFacultyNotifications:spark}=require('../faculty-fund-notifications.js');const e=env('president','spark-school-y');const r={id:'r',createdBy:'ao',status:'accepted',acceptedBy:'president',acceptedAt:{toMillis:()=>1},correctionId:'c'};
 spark([r],[{id:'c',remittanceId:'wrong',status:'pending',requestedBy:'ao',requestedAt:{toMillis:()=>2}}],e.state,{presidentUid:'president'},e.io);assert.equal(e.events.length,0);
 spark([r],[{id:'c',remittanceId:'r',status:'pending',requestedBy:'ao',requestedAt:{toMillis:()=>2}}],e.state,{presidentUid:'president'},e.io);assert.equal(e.events.length,1);assert.match(e.events[0].title,/correction/);
});
