'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('team has its own accessible modal and preserves collaboration controls',()=>{
 assert.match(html,/id="teamModal" class="team-modal no-print" hidden/);assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="teamModalTitle"/);
 assert.ok(html.indexOf('id="teamPanel"')<html.indexOf('id="settingsModal"'));assert.doesNotMatch(html,/data-stab="team"/);
 for(const id of ['teamWorkspaceList','teamMembersList','teamJoinRequests','teamInviteRole','teamSearchOrg','teamNewOrgName','teamColor','teamIcon'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/@media\(max-width:700px\).*?\.team-dialog/s);assert.match(html,/stopImmediatePropagation\(\);if\(activeOverlay===actionOverlay\)closeTeamAction\(\);else closeTeamModal/);
});
test('shared appearance saves only for a confirmed online owner and bounds values',async()=>{
 const src=html.slice(html.indexOf('async function saveTeamAppearance()'),html.indexOf('\nwindow.pondoTeam = {',html.indexOf('async function saveTeamAppearance()')));
 const fields={teamColor:{value:'ocean'},teamIcon:{value:'star'},teamAppearanceStatus:{textContent:''}},writes=[];
 const state={orgId:'o',uid:'owner',role:'owner',memberConfirmed:true};const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'owner'}},document:{getElementById:id=>fields[id]},navigator:{onLine:true},firestoreDb:{},doc:(_,...v)=>v,updateDoc:async(...args)=>writes.push(args)};vm.runInNewContext(src,c);
 await c.saveTeamAppearance();assert.equal(writes.length,1);assert.equal(writes[0][1].teamColor,'ocean');assert.match(fields.teamAppearanceStatus.textContent,/Saved/);
 state.role='reviewer';await c.saveTeamAppearance();state.role='owner';state.memberConfirmed=false;await c.saveTeamAppearance();state.memberConfirmed=true;c.navigator.onLine=false;await c.saveTeamAppearance();c.navigator.onLine=true;fields.teamColor.value='javascript:bad';await c.saveTeamAppearance();assert.equal(writes.length,1);
});
test('member removal cannot cross workspaces during confirmation',async()=>{
 const src=html.slice(html.indexOf('async function removeMember(uid)'),html.indexOf('\nasync function leaveOrganization()',html.indexOf('async function removeMember(uid)')));
 const state={orgId:'one',uid:'owner',role:'owner',memberConfirmed:true,members:[{uid:'member'}]},deleted=[];
 const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'owner'}},navigator:{onLine:true},confirmAction:async()=>{state.orgId='two';return true},notify(){},firestoreDb:{},doc:(_,...args)=>args,deleteDoc:async x=>deleted.push(x)};vm.runInNewContext(src,c);await c.removeMember('member');assert.equal(deleted.length,0);
});
test('workspace display name is owner-only, scoped, and explicitly separate from the registered search name',async()=>{
 const src=html.slice(html.indexOf('async function saveTeamDisplayName()'),html.indexOf('\nasync function saveTeamAppearance()'));
 const fields={teamDisplayName:{value:'  New   Team '},teamNameStatus:{textContent:''}},writes=[],state={orgId:'team',uid:'owner',role:'owner',memberConfirmed:true};const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'owner'}},document:{getElementById:id=>fields[id]},navigator:{onLine:true},firestoreDb:{},doc:(_,...v)=>v,updateDoc:async(...v)=>writes.push(v)};vm.runInNewContext(src,c);await c.saveTeamDisplayName();assert.equal(writes[0][1].displayName,'New Team');assert.match(fields.teamNameStatus.textContent,/registered search name is unchanged/);state.role='reviewer';await c.saveTeamDisplayName();state.role='owner';fields.teamDisplayName.value='bad/name';await c.saveTeamDisplayName();assert.equal(writes.length,1);assert.match(html,/aria-label="About workspace settings"/);assert.match(html,/registered name remains the search name/);
});
test('appearance save prevents duplicate writes and keeps later previews and workspace switches scoped',async()=>{
 const start=html.indexOf('async function saveTeamAppearance()'),src=html.slice(start,html.indexOf('\nwindow.pondoTeam = {',start));
 const fields={teamColor:{value:'ocean'},teamIcon:{value:'star'},teamAppearanceStatus:{textContent:''}},button={disabled:false},writes=[],finishes=[];let resolve;
 const state={orgId:'one',uid:'owner',role:'owner',memberConfirmed:true},window={pondoCurrentUser:{uid:'owner'},finishTeamAppearanceSave:(...args)=>finishes.push(args)};
 const c={pondoTeamState:state,window,document:{getElementById:id=>fields[id],querySelector:()=>button},navigator:{onLine:true},firestoreDb:{},doc:(_,...args)=>args,updateDoc:(...args)=>{writes.push(args);return new Promise(r=>resolve=r)}};vm.runInNewContext(src,c);
 const first=c.saveTeamAppearance();assert.equal(button.disabled,true);fields.teamIcon.value='heart';await c.saveTeamAppearance();assert.equal(writes.length,1);resolve();await first;assert.match(fields.teamAppearanceStatus.textContent,/Earlier selection saved/);assert.equal(button.disabled,false);assert.equal(finishes.length,1);
 const second=c.saveTeamAppearance();state.orgId='two';fields.teamAppearanceStatus.textContent='New workspace';resolve();await second;assert.equal(fields.teamAppearanceStatus.textContent,'New workspace');assert.equal(finishes.length,1);
 window.pondoCurrentUser.uid='other';await c.saveTeamAppearance();assert.equal(writes.length,2);assert.match(fields.teamAppearanceStatus.textContent,/confirmed workspace owner/);
});
