'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('team has its own accessible modal and preserves collaboration controls',()=>{
 assert.match(html,/id="teamModal" class="team-modal no-print" hidden/);assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="teamModalTitle"/);
 assert.ok(html.indexOf('id="teamPanel"')<html.indexOf('id="settingsModal"'));assert.doesNotMatch(html,/data-stab="team"/);
 for(const id of ['teamWorkspaceList','teamMembersList','teamJoinRequests','teamInviteRole','teamSearchOrg','teamNewOrgName','teamColor','teamIcon'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/@media\(max-width:700px\).*?\.team-dialog/s);assert.match(html,/stopImmediatePropagation\(\);closeTeamModal/);
});
test('shared appearance saves only for a confirmed online owner and bounds values',async()=>{
 const src=html.slice(html.indexOf('async function saveTeamAppearance()'),html.indexOf('\nwindow.pondoTeam = {',html.indexOf('async function saveTeamAppearance()')));
 const fields={teamColor:{value:'ocean'},teamIcon:{value:'star'},teamAppearanceStatus:{textContent:''}},writes=[];
 const state={orgId:'o',uid:'owner',role:'owner',memberConfirmed:true};const c={pondoTeamState:state,document:{getElementById:id=>fields[id]},navigator:{onLine:true},firestoreDb:{},doc:(_,...v)=>v,updateDoc:async(...args)=>writes.push(args)};vm.runInNewContext(src,c);
 await c.saveTeamAppearance();assert.equal(writes.length,1);assert.equal(writes[0][1].teamColor,'ocean');assert.match(fields.teamAppearanceStatus.textContent,/Saved/);
 state.role='reviewer';await c.saveTeamAppearance();state.role='owner';state.memberConfirmed=false;await c.saveTeamAppearance();state.memberConfirmed=true;c.navigator.onLine=false;await c.saveTeamAppearance();c.navigator.onLine=true;fields.teamColor.value='javascript:bad';await c.saveTeamAppearance();assert.equal(writes.length,1);
});
test('member removal cannot cross workspaces during confirmation',async()=>{
 const src=html.slice(html.indexOf('async function removeMember(uid)'),html.indexOf('\nasync function leaveOrganization()',html.indexOf('async function removeMember(uid)')));
 const state={orgId:'one',uid:'owner',role:'owner',memberConfirmed:true,members:[{uid:'member'}]},deleted=[];
 const c={pondoTeamState:state,window:{pondoCurrentUser:{uid:'owner'}},navigator:{onLine:true},facultyPresidentKnown:true,facultyPresidentUid:null,confirmAction:async()=>{state.orgId='two';return true},notify(){},firestoreDb:{},doc:(_,...args)=>args,deleteDoc:async x=>deleted.push(x)};vm.runInNewContext(src,c);await c.removeMember('member');assert.equal(deleted.length,0);
});
