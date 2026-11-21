'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const refresh=html.slice(html.indexOf('let membershipRefreshGeneration=0;'),html.indexOf('\nasync function handleRemovedFromOrg()'));
const init=html.slice(html.indexOf('async function initCollaboration(user)'),html.indexOf('\nfunction teardownCollaboration()'));
const snap=data=>({exists:()=>data!=null,data:()=>data});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(){
 const state={uid:'u',orgId:null,orgMemberships:['a','b'],memberships:[{orgId:'a',name:'Alpha',role:'owner'},{orgId:'b',name:'Beta',role:'reviewer'}]},writes=[],calls=[];
 const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'u'},renderTeamSwitcherMenu:()=>calls.push('menu'),refreshHeaderAvatarMenuIfOpen:()=>calls.push('avatar')},firestoreDb:{},doc:(_,...v)=>v,getDocFromServer:async()=>snap({role:'owner'}),getDoc:async()=>snap({name:'New name'}),arrayRemove:(...ids)=>ids,runTransaction:async(_,fn)=>fn({get:async ref=>snap(ref[0]==='users'?{activeOrganizationId:'a'}:null),set:(...v)=>writes.push(v)}),renderTeamPanel:()=>calls.push('panel')};
 vm.runInNewContext(refresh,c);return {state,c,writes,calls};
}
test('refresh keeps names and roles on transient errors, and resolves all workspaces in parallel',async()=>{
 const {state,c}=setup(),a=deferred(),b=deferred(),reads=[];
 c.getDocFromServer=ref=>{reads.push(ref[1]);return ref[1]==='a'?a.promise:b.promise};
 const work=c.refreshMemberships();assert.deepEqual(reads,['a','b']);assert.equal(state.memberships[0].name,'Alpha');
 a.resolve(snap({role:'disbursing'}));b.resolve(snap({role:'reviewer'}));c.getDoc=async()=>{throw Error('offline')};await work;
 assert.equal(state.memberships[0].name,'Alpha');assert.equal(state.memberships[0].role,'disbursing');assert.equal(state.memberships[1].name,'Beta');
 c.getDocFromServer=async()=>{throw Error('offline')};await c.refreshMemberships();assert.equal(state.memberships[0].name,'Alpha');assert.equal(state.memberships[1].role,'reviewer');
});
test('only latest refresh commits and preserves newly added IDs',async()=>{
 const {state,c}=setup(),hold=deferred();let first=true;
 c.getDocFromServer=ref=>first&&ref[1]==='a'?hold.promise:Promise.resolve(snap({role:'reviewer'}));
 c.getDoc=async ref=>snap({name:ref[1]==='a'?'Latest Alpha':'Beta'});
 const old=c.refreshMemberships();first=false;state.orgMemberships.push('c');await c.refreshMemberships();hold.resolve(snap({role:'owner'}));await old;
 assert.equal(state.memberships[0].name,'Latest Alpha');assert.equal(state.memberships.length,3);
});
test('removal is rechecked in a transaction, including active pointer; reapproval and transaction failure retain entries',async()=>{
 for(const mode of ['absent','reapproved','error']){
  const {state,c,writes}=setup();c.getDocFromServer=async ref=>ref[1]==='a'?snap(null):snap({role:'reviewer'});c.getDoc=async()=>snap({name:'Beta'});
  c.runTransaction=async(_,fn)=>{if(mode==='error')throw Error('offline');return fn({get:async ref=>snap(ref[0]==='users'?{activeOrganizationId:'a'}:mode==='reapproved'?{role:'owner'}:null),set:(...v)=>writes.push(v)})};
  await c.refreshMemberships();assert.equal(state.orgMemberships.includes('a'),mode!=='absent');
  if(mode==='absent'){assert.equal(writes[0][1].activeOrganizationId,null);assert.deepEqual(Array.from(writes[0][1].orgMemberships),['a']);}else assert.equal(writes.length,0);
 }
});
test('stale account refresh never publishes after account change',async()=>{
 const {state,c,calls}=setup(),wait=deferred();c.getDocFromServer=()=>wait.promise;const work=c.refreshMemberships();state.uid='other';state.orgMemberships=[];state.memberships=[];c.window.pondoCurrentUser={uid:'other'};wait.resolve(snap({role:'owner'}));await work;assert.equal(state.memberships.length,0);assert.equal(calls.length,0);
});
test('initial preload shows loading and does not subscribe after account changes',async()=>{
 const profile=deferred(),state={uid:null,orgMemberships:[],memberships:[]},calls=[];
 const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'u'},refreshTeamSwitcherMenuIfOpen:()=>calls.push('menus')},firestoreDb:{},doc:(_,...v)=>v,getDoc:()=>profile.promise,legacyMigrateUserDoc:()=>({orgMemberships:['a'],activeOrganizationId:'a'}),renderTeamPanel:()=>calls.push('panel'),recoverMembershipList:()=>{},getPendingInviteCode:()=>'',subscribeToOrg:()=>calls.push('subscribe'),approvalTracker:{start:()=>calls.push('approval')},console};vm.runInNewContext(init,c);
 const work=c.initCollaboration({uid:'u'});assert.equal(state.membershipsLoading,true);assert.equal(state.initialWorkspacePending,true);state.uid='v';c.window.pondoCurrentUser={uid:'v'};profile.resolve(snap({orgMemberships:['a'],activeOrganizationId:'a'}));await work;assert.ok(!calls.includes('subscribe'));assert.ok(!calls.includes('approval'));assert.equal(state.orgMemberships.length,0);
});
test('header menus display loading and avoid replacing identical markup',()=>{
 const source=html.slice(html.indexOf('const workspaceIcons='),html.indexOf('\nfunction closeWorkspaceMenu('))+'\n'+html.slice(html.indexOf('function renderHeaderAvatarMenu()'),html.indexOf('\nfunction closeHeaderAvatarMenu('));
 const elements={teamSwitcherMenu:{},headerAvatarMenu:{}};let updates=0;for(const el of Object.values(elements))Object.defineProperty(el,'innerHTML',{set(v){this.value=v;updates++},get(){return this.value}});
 const state={orgId:null,memberships:[],membershipsLoading:true};const window={pondoTeamState:state,pondoCurrentUser:{uid:'u'},ROLE_LABELS:{}};
 const c={window,document:{getElementById:id=>elements[id]},escapeTeamText:s=>String(s)};vm.runInNewContext(source,c);c.renderTeamSwitcherMenu();c.renderHeaderAvatarMenu();assert.match(elements.teamSwitcherMenu.value,/Checking workspaces/);assert.match(elements.headerAvatarMenu.value,/Checking workspaces/);c.renderTeamSwitcherMenu();c.renderHeaderAvatarMenu();assert.equal(updates,2);
 state.membershipsLoading=false;state.memberships=[{orgId:'a',name:'Alpha',role:'owner'}];c.renderTeamSwitcherMenu();c.renderHeaderAvatarMenu();assert.match(elements.teamSwitcherMenu.value,/Alpha/);assert.match(elements.headerAvatarMenu.value,/Alpha/);assert.equal(updates,4);
});
test('Team workspace list shows progress and preserves identical rows on rerender',()=>{
 const begin=html.indexOf('function renderTeamPanel()'),end=html.indexOf('  const activeOrgPanel =',begin),source=html.slice(begin,end)+'}\n';
 function element(){let inner='',count=0;return {children:[],style:{},set innerHTML(v){inner=v;count++;this.children=[]},get innerHTML(){return inner},get writes(){return count},appendChild(el){this.children.push(el)},append(...els){this.children.push(...els)},setAttribute(){},addEventListener(){}}}
 const ids={teamLoading:element(),teamSignedInPanel:element(),teamSignedOutNotice:element(),teamWorkspaceList:element()};
 const state={uid:'u',orgId:null,memberships:[],membershipsLoading:true};const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'u'}},ROLE_LABELS:{owner:'Owner'},document:{getElementById:id=>ids[id],createElement:element},updateHeaderTeamBadge(){},switchActiveWorkspace(){}};vm.runInNewContext(source,c);
 c.renderTeamPanel();let list=ids.teamWorkspaceList;assert.equal(list.children.at(-1).textContent,'Checking workspaces…');c.renderTeamPanel();assert.equal(list.writes,1);
 state.membershipsLoading=false;state.memberships=[{orgId:'a',name:'Alpha',role:'owner'}];c.renderTeamPanel();assert.equal(list.children[1].children[0].children[0].textContent,'Alpha');c.renderTeamPanel();assert.equal(list.writes,2);
});
test('a removal finishing after an account switch cannot switch the new account',async()=>{
 const src=html.slice(html.indexOf('async function handleRemovedFromOrg()'),html.indexOf('\nfunction randomInviteCode()'));
 const wait=deferred(),state={uid:'u',initializationToken:{},orgId:'a',orgMemberships:['a','b']},calls=[];
 const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'u'}},doc:(_,...v)=>v,firestoreDb:{},arrayRemove:id=>id,setDoc:()=>wait.promise,switchActiveWorkspace:async()=>calls.push('switch'),refreshMemberships:async()=>calls.push('refresh')};vm.runInNewContext(src,c);const work=c.handleRemovedFromOrg();state.uid='v';state.orgId='c';state.initializationToken={};c.window.pondoCurrentUser={uid:'v'};wait.resolve();await work;assert.deepEqual(calls,[]);
});
test('startup keeps loading visible until both active check and list preload settle',async()=>{
 const active=deferred(),preload=deferred(),state={uid:null,orgMemberships:[],memberships:[]},calls=[];
 const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'u'},refreshTeamSwitcherMenuIfOpen(){}},firestoreDb:{},doc:(_,...v)=>v,getDoc:ref=>ref[0]==='users'?Promise.resolve(snap({orgMemberships:['a'],activeOrganizationId:'a'})):active.promise,legacyMigrateUserDoc:()=>({orgMemberships:['a'],activeOrganizationId:'a'}),renderTeamPanel(){},recoverMembershipList(){},getPendingInviteCode:()=>'',subscribeToOrg:id=>{state.orgId=id;calls.push(id)},refreshMemberships:()=>preload.promise,maybeShowTeamOnboarding(){},approvalTracker:{start(){}},console};vm.runInNewContext(init,c);
 const work=c.initCollaboration({uid:'u'});await new Promise(r=>setImmediate(r));assert.equal(state.membershipsLoading,true);active.resolve({...snap({role:'owner'}),metadata:{fromCache:true,hasPendingWrites:false}});await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['a']);assert.equal(state.membershipsLoading,true);
 state.membershipsLoaded=true;state.membershipsLoading=false;preload.resolve();await work;assert.equal(state.membershipsLoading,false);
});
test('cached missing organization does not remove a workspace and old listener errors are ignored',()=>{
 const start=html.indexOf('function subscribeToOrg(orgId)'),end=html.indexOf('\n  pondoTeamState.unsubMembers',start);
 const src=html.slice(start,end)+'\n}';let callback,error,removed=0,failures=0;
 const state={uid:'u',orgId:null,memberships:[{orgId:'a',name:'Alpha'}],initializationToken:{}},window={pondoCurrentUser:{uid:'u'}};
 const c={pondoTeamState:state,window,teardownOrgSubscriptions(){},localStorage:{getItem:()=>null},teamDraftKey:()=>'',applyRoleUI(){},setSyncBadge(){},navigator:{onLine:true},firestoreDb:{},doc:(_,...v)=>v,onSnapshot:(_ref,_opt,cb,err)=>{callback=cb;error=err;return()=>{}},handleRemovedFromOrg(){removed++},handleTeamListenerError(){failures++},document:{getElementById:()=>null},renderTeamPanel(){}};
 vm.runInNewContext(src,c);c.subscribeToOrg('a');assert.equal(state.orgName,'Alpha');callback({...snap(null),metadata:{fromCache:true,hasPendingWrites:false}});assert.equal(removed,0);callback({...snap(null),metadata:{fromCache:false,hasPendingWrites:false}});assert.equal(removed,1);window.pondoCurrentUser={uid:'v'};callback({...snap(null),metadata:{fromCache:false,hasPendingWrites:false}});error(Error('late'));assert.equal(removed,1);assert.equal(failures,0);
});
