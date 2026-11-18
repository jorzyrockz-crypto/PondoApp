'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('faculty-fund-ui.js','utf8');
function teamSetup(){
 const code=html.slice(html.indexOf('async function changeMemberRole('),html.indexOf('\nasync function removeMember(',html.indexOf('async function changeMemberRole(')));
 const notifications=[],assignments=[],changes=[];
 const state={orgId:'org~faculty fund test school',uid:'owner',role:'owner',memberConfirmed:true,members:[{uid:'viewer',role:'reviewer',displayName:'Viewer'},{uid:'other',role:'reviewer'},{uid:'ao',role:'disbursing'}]};
 const ctx={pondoTeamState:state,facultyPresidentKnown:true,facultyPresidentUid:null,navigator:{onLine:true},window:{PondoFacultyFundUI:{assignPresident:async(...args)=>assignments.push(args)}},notify:v=>notifications.push(v),confirmAction:async()=>true,renderTeamPanel:()=>{},updateDoc:async(ref,value)=>changes.push(value),doc:()=>({}),firestoreDb:{}};
 vm.runInNewContext(code,ctx);return {ctx,state,notifications,assignments,changes};
}
test('owner selects Faculty President for a Viewer without changing their team role',async()=>{
 const t=teamSetup();await t.ctx.selectMemberRole('viewer','faculty-president');assert.equal(t.assignments.length,1);assert.equal(t.assignments[0][0],'viewer');assert.equal(t.assignments[0][1].orgId,t.state.orgId);assert.equal(t.state.members[0].role,'reviewer');assert.equal(t.changes.length,0);assert.match(t.notifications[0],/server confirms/);
});
test('non-owner, non-viewer, unconfirmed state, cancellation and changed workspace cannot assign',async()=>{
 for(const mode of ['nonowner','nonviewer','unconfirmed','unknown','cancel','changed']){
  const t=teamSetup();if(mode==='nonowner')t.state.role='reviewer';if(mode==='unconfirmed')t.state.memberConfirmed=false;if(mode==='unknown')t.ctx.facultyPresidentKnown=false;if(mode==='cancel')t.ctx.confirmAction=async()=>false;if(mode==='changed')t.ctx.confirmAction=async()=>{t.state.orgId='other';return true};
  await t.ctx.selectMemberRole(mode==='nonviewer'?'ao':'viewer','faculty-president');assert.equal(t.assignments.length,0,mode);assert.equal(t.changes.length,0,mode);
 }
});
test('a President cannot be silently demoted by changing team role; reassignment is separate',async()=>{
 const t=teamSetup();t.ctx.facultyPresidentUid='viewer';await t.ctx.selectMemberRole('viewer','reviewer');assert.equal(t.changes.length,0);assert.match(t.notifications[0],/Assign another Faculty President/);await t.ctx.selectMemberRole('other','disbursing');assert.equal(t.changes[0].role,'disbursing');
});
function uiSetup(){
 const values=new Map(),sent=[];const window={pondoCurrentUser:{uid:'owner'},pondoTeamState:{uid:'owner',orgId:'org~faculty fund test school',role:'owner',memberConfirmed:true,members:[{uid:'viewer',role:'reviewer'},{uid:'ao',role:'disbursing'}]},pondoFacultyAPI:{getRecoveryContext:()=>({}),read:async()=>({}),transition:async input=>{sent.push(input);return {ok:true}}}};
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 vm.runInNewContext(ui,{window,localStorage,navigator:{onLine:true},crypto:webcrypto,Intl,Uint8Array,Error,Set,Map,JSON,Number,String,Array});
 return {window,sent,values,expected:{uid:'owner',role:'owner',orgId:'org~faculty fund test school'}};
}
test('direct assignment uses the retry-safe protected Faculty Fund transition',async()=>{
 const t=uiSetup();await t.window.PondoFacultyFundUI.assignPresident('viewer',t.expected);assert.equal(t.sent.length,1);assert.equal(t.sent[0].operation,'assignPresident');assert.equal(t.sent[0].presidentUid,'viewer');assert.match(t.sent[0].requestId,/^[a-f0-9]{32}$/);assert.equal(t.values.size,0);
 await assert.rejects(t.window.PondoFacultyFundUI.assignPresident('ao',t.expected),/Viewer/);assert.equal(t.sent.length,1);
});
test('uncertain assignment keeps its retry token and never reports success',async()=>{
 const t=uiSetup();t.window.pondoFacultyAPI.transition=async input=>{t.sent.push(input);throw Error('network lost')};await assert.rejects(t.window.PondoFacultyFundUI.assignPresident('viewer',t.expected),/unconfirmed/);const saved=JSON.parse([...t.values.values()][0]);assert.equal(saved.requestId,t.sent[0].requestId);assert.equal(saved.operation,'assignPresident');assert.equal(saved.presidentUid,'viewer');
});
function watchSetup(){
 const start=html.indexOf('let facultyStateUnsub=null'),end=html.indexOf('\nfunction teardownOrgSubscriptions()',start);
 const listeners=[],state={orgId:'org~faculty fund test school',uid:'owner',memberConfirmed:true},ctx={FACULTY_FUND_RESTORE_DEMO:false,pondoTeamState:state,window:{pondoFacultyAPI:{capabilities:{mode:'firebase-test-only'}},PondoFacultyFundUI:{reset(){}}},firestoreDb:{},doc:(_db,...p)=>p,collection:(_db,...p)=>p,query:p=>p,limit:n=>n,onSnapshot:(p,opts,next,error)=>{listeners.push({path:p,next,error});return ()=>{}},renderTeamPanel(){},console};
 vm.runInNewContext(html.slice(start,end)+'\nthis.startFacultyWatch=startFacultyWatch;this.stopFacultyWatch=stopFacultyWatch;this.presidentStatus=()=>({known:facultyPresidentKnown,uid:facultyPresidentUid});',ctx);return {ctx,state,listeners};
}
test('President label follows only confirmed config and clears on workspace change or cached snapshots',()=>{
 const t=watchSetup();t.ctx.startFacultyWatch(t.state.orgId,'owner');assert.equal(t.listeners.length,4);assert.equal(t.listeners[3].path.at(-2),'sparkDiscoveryConfig');const l=t.listeners[3],snap=(id,fromCache=false)=>({metadata:{fromCache,hasPendingWrites:false},exists:()=>!!id,data:()=>({presidentUid:id})});
 l.next(snap('viewer',true));assert.equal(t.ctx.presidentStatus().known,false);l.next(snap('viewer'));assert.equal(t.ctx.presidentStatus().uid,'viewer');assert.equal(t.ctx.presidentStatus().known,true);
 l.next(snap('other',true));assert.equal(t.ctx.presidentStatus().known,false);t.ctx.stopFacultyWatch();t.state.orgId='org~faculty fund test other';l.next(snap('viewer'));assert.equal(t.ctx.presidentStatus().uid,null);assert.equal(t.ctx.presidentStatus().known,false);
});
test('normal workspaces never start the test-only President config listener',()=>{const t=watchSetup();t.state.orgId='org~normal school';t.ctx.startFacultyWatch(t.state.orgId,'owner');assert.equal(t.listeners.length,0)});

test('test-mode revision listener only schedules confirmed updates for the current workspace',()=>{
 const t=watchSetup();let count=0;t.ctx.window.PondoFacultyFundUI.scheduleLiveRefresh=()=>count++;t.ctx.startFacultyWatch(t.state.orgId,'owner');const l=t.listeners[0];assert.equal(l.path.at(-2),'sparkDiscoveryRevision');
 l.next({metadata:{fromCache:true,hasPendingWrites:false}});l.next({metadata:{fromCache:false,hasPendingWrites:true}});assert.equal(count,0);l.next({metadata:{fromCache:false,hasPendingWrites:false},exists:()=>true,data:()=>({revision:3})});assert.equal(count,1);
 t.ctx.stopFacultyWatch();l.next({metadata:{fromCache:false,hasPendingWrites:false},exists:()=>true,data:()=>({revision:3})});assert.equal(count,1);
});
test('confirmed Spark listener updates notify only the scoped member and stop on workspace changes',()=>{
 const t=watchSetup(),events=[],{processSparkFacultyNotifications}=require('../faculty-fund-notifications.js');
 t.state.uid='president';t.state.role='reviewer';t.ctx.localStorage={getItem:()=>null,setItem:()=>{}};t.ctx.window.pushNotification=n=>{events.push(n);return n};t.ctx.window.processSparkFacultyNotifications=processSparkFacultyNotifications;
 t.ctx.startFacultyWatch(t.state.orgId,t.state.uid);const [_,remit,correction,config]=t.listeners;
 assert.equal(remit.path.at(-1),'sparkDiscoveryRemittances');assert.equal(correction.path.at(-1),'sparkDiscoveryCorrections');
 const meta={fromCache:false,hasPendingWrites:false},col=(rows,metadata=meta)=>({metadata,size:rows.length,forEach:fn=>rows.forEach(([id,data])=>fn({id,data:()=>data}))});
 config.next({metadata:meta,exists:()=>true,data:()=>({presidentUid:'president'})});correction.next(col([]));
 const row=[['r',{status:'pending',createdBy:'ao',presidentUid:'president'}]];
 remit.next(col(row,{fromCache:true,hasPendingWrites:false}));remit.next(col(row,{fromCache:false,hasPendingWrites:true}));assert.equal(events.length,0);
 remit.next(col(row));assert.equal(events.length,1);assert.equal(events[0].recipientUid,'president');assert.equal(events[0].orgId,t.state.orgId);remit.next(col(row));assert.equal(events.length,1);
 t.ctx.stopFacultyWatch();remit.next(col([['other',{status:'pending',createdBy:'ao',presidentUid:'president'}]]));assert.equal(events.length,1);
});

test('release-preview notifications use the same existing organization without the test-name restriction',()=>{
 const t=watchSetup();t.state.orgId='org~normal school';t.ctx.window.pondoFacultyAPI.capabilities.mode='release-preview-only';t.ctx.startFacultyWatch(t.state.orgId,'owner');assert.equal(t.listeners.length,4);assert.equal(t.listeners[0].path.at(-2),'sparkDiscoveryRevision');assert.equal(t.listeners[3].path.at(-2),'sparkDiscoveryConfig');
});

test('restore demo suppresses notifications and watchers while recovery is under development',()=>{const t=watchSetup();t.ctx.FACULTY_FUND_RESTORE_DEMO=true;t.ctx.startFacultyWatch(t.state.orgId,'owner');assert.equal(t.listeners.length,0);});
