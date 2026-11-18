'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('join-request listener receives confirmed identities, filters stale updates and clears on scope change',()=>{
 const src=html.slice(html.indexOf('let joinRequestUnsub='),html.indexOf('\nfunction loadJoinRequests()',html.indexOf('let joinRequestUnsub=')));
 const output={textContent:'',replaceChildren(){this.textContent=''}},state={orgId:'org',uid:'owner',role:'owner',memberConfirmed:true,orgName:'School'},window={updateNotifBadge(){},refreshNotifCenterIfOpen(){}};let callback,unsubs=0,rendered=[];
 const c={pondoTeamState:state,window,document:{getElementById:()=>output},query:(...a)=>a,collection:(_,...a)=>a,where:(...a)=>a,limit:n=>n,firestoreDb:{},onSnapshot:(_query,_opts,cb)=>{callback=cb;return()=>unsubs++},renderJoinRequests:r=>rendered=r,console};vm.runInNewContext(src,c);
 c.startJoinRequestWatch('org','owner');const snap=(cache=false)=>({metadata:{fromCache:cache,hasPendingWrites:false},forEach:fn=>fn({id:'guest',data:()=>({status:'pending',displayName:'Guest Person',email:'guest@example.test',requestedAt:{toMillis:()=>123}})})});
 callback(snap(true));assert.equal(window.pondoJoinNotices.length,0);callback(snap());assert.equal(rendered[0].email,'guest@example.test');assert.equal(window.pondoJoinNotices[0].kind,'joinRequest');assert.match(window.pondoJoinNotices[0].body,/Guest Person/);
 state.orgId='other';callback(snap());c.stopJoinRequestWatch();assert.equal(window.pondoJoinNotices.length,0);assert.equal(unsubs,1);
});
test('request actions are scoped after confirmation and suggestions remain optional',()=>{
 assert.match(html,/teamSearchSuggestions/);assert.match(html,/if\(pondoTeamState\.orgId!==orgId\|\|pondoTeamState\.uid!==uid\|\|pondoTeamState\.role!=='owner'\|\|!pondoTeamState\.memberConfirmed\)return/);
 assert.match(html,/Suggestions are unavailable\. Search by the full registered name instead/);assert.match(html,/function notificationAction\(n\)\{\s*if\(n\.kind==='joinRequest'\)/);
});
