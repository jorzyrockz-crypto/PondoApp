const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.indexOf('function onlineTeamMembers('),html.indexOf('// Compare document contents, not property insertion order.'));
function harness(){
 const button={hidden:true,innerHTML:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},replaceChildren(){this.innerHTML=''}};
 const state={orgId:'school',uid:'me',memberConfirmed:true,presenceReady:false,presenceTimes:new Map(),members:[{uid:'me',displayName:'Me'},{uid:'other',displayName:'Other'}]};
 let snap,fail,tick,unsubscribed=0,writes=[],listeners={},documentListeners={};
 const win={pondoCurrentUser:{uid:'me'},addEventListener:(k,fn)=>listeners[k]=fn};
 const c=vm.createContext({window:win,pondoTeamState:state,navigator:{onLine:true},document:{hidden:false,getElementById:()=>button,addEventListener:(k,fn)=>documentListeners[k]=fn},
  buildTeamFacepileHtml:members=>Array.from(members,m=>m.displayName).join(','),Date,Map,Number,console:{warn(){}},firestoreDb:{},doc:(...v)=>v,collection:(...v)=>v,serverTimestamp:()=>'server-time',
  setDoc:async(ref,data)=>{writes.push({ref,data})},onSnapshot:(ref,opts,onNext,onError)=>{snap=onNext;fail=onError;return ()=>{unsubscribed++}},setInterval:fn=>{tick=fn;return 1},clearInterval(){}});
 vm.runInContext(src,c);
 return {c,state,button,writes,win,listeners,documentListeners,emit:(rows,meta={})=>snap({metadata:{fromCache:false,hasPendingWrites:false,...meta},forEach:fn=>rows.forEach(r=>fn({id:r.id,data:()=>({lastSeen:{toMillis:()=>r.ts}})}))}),fail:()=>fail(Error('denied')),tick:()=>tick(),unsubscribed:()=>unsubscribed};
}
test('only recent server-confirmed current members appear, with expiry and unknown state',async()=>{
 const h=harness();h.c.startTeamPresence('school','me');assert.equal(h.writes.length,1);assert.equal(h.button.attrs['aria-label'],'Team presence unavailable. Open team settings.');
 const now=Date.now();h.emit([{id:'me',ts:now},{id:'other',ts:now},{id:'outsider',ts:now}]);assert.equal(h.button.innerHTML,'Other,Me');assert.match(h.button.attrs['aria-label'],/2 recently active/);
 h.emit([{id:'me',ts:now-151000},{id:'other',ts:now+50000}]);assert.match(h.button.attrs['aria-label'],/No recently active/);
 h.emit([{id:'me',ts:now}],{fromCache:true});assert.match(h.button.attrs['aria-label'],/No recently active/);
 h.fail();assert.match(h.button.attrs['aria-label'],/unavailable/);assert.doesNotMatch(h.button.innerHTML,/Me|Other/);
});
test('workspace changes, reconnect and visibility restart presence without trusting stale listeners',async()=>{
 const h=harness();h.c.startTeamPresence('school','me');h.emit([{id:'me',ts:Date.now()}]);assert.equal(h.button.innerHTML,'Me');
 h.state.orgId='other-school';h.c.stopTeamPresence();assert.equal(h.unsubscribed(),1);h.emit([{id:'other',ts:Date.now()}]);assert.match(h.button.attrs['aria-label'],/unavailable/);
 h.c.startTeamPresence('other-school','me');assert.equal(h.writes[1].ref[2],'other-school');
 h.c.navigator.onLine=false;h.listeners.offline();assert.match(h.button.attrs['aria-label'],/unavailable/);h.c.navigator.onLine=true;h.listeners.online();assert.equal(h.unsubscribed(),2);assert.equal(h.writes.length,3);
 h.documentListeners.visibilitychange();assert.equal(h.unsubscribed(),3);assert.equal(h.writes.length,4);
});
test('presence refuses unconfirmed membership, expires after time and leaves personal chip available',()=>{
 const h=harness();h.state.memberConfirmed=false;h.c.startTeamPresence('school','me');assert.equal(h.writes.length,0);
 h.state.memberConfirmed=true;h.state.presenceReady=true;h.state.presenceTimes=new Map([['me',1000]]);assert.equal(h.c.onlineTeamMembers(h.state,150999).length,1);assert.equal(h.c.onlineTeamMembers(h.state,151000).length,0);
 h.state.orgId=null;h.c.renderHeaderTeamPresence();assert.equal(h.button.hidden,true);
 assert.match(html,/if \(chip\) chip\.hidden = !!pondoTeamState\.orgId/);assert.match(html,/if \(!mine\) \{ if\(memberConfirmed\) handleRemovedFromOrg\(\)/);
 assert.match(html,/window\.buildTeamFacepileHtml=buildTeamFacepileHtml/);assert.match(html,/renderHeaderTeamPresence\(\);\s*\/\/ Members load/);
});
