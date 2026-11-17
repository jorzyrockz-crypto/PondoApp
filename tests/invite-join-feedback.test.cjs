const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.indexOf('async function initCollaboration(user)'),html.indexOf('\nfunction teardownCollaboration()'));
function setup(shouldFail){
 const messages=[],calls=[],state={uid:null,orgMemberships:[],orgId:null};
 const c=vm.createContext({pondoTeamState:state,firestoreDb:{},doc:(...args)=>args,getDoc:async()=>({exists:()=>false}),setDoc:async()=>{},legacyMigrateUserDoc:()=>({orgMemberships:[],activeOrganizationId:null}),renderTeamPanel(){},getPendingInviteCode:()=>'invite-code',joinWithInviteCode:async()=>{calls.push('join');if(shouldFail)throw Error('failed')},clearInviteFromUrl:()=>calls.push('clear'),refreshMemberships:async()=>calls.push('refresh'),notify:m=>messages.push(m),maybeShowTeamOnboarding(){},subscribeToOrg(){},console:{warn(){}}});vm.runInContext(src,c);return{c,calls,messages};
}
test('failed automatic join explains the problem without removing the invitation',async()=>{let t=setup(true);await t.c.initCollaboration({uid:'u'});assert.deepEqual(t.calls,['join','refresh']);assert.match(t.messages[0],/Could not finish opening/);assert.doesNotMatch(t.messages[0],/invite-code/)});
test('successful automatic join clears the link after joining',async()=>{let t=setup(false);await t.c.initCollaboration({uid:'u'});assert.deepEqual(t.calls,['join','clear','refresh']);assert.equal(t.messages.length,0)});
