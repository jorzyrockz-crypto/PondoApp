const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.attributes={};this.listeners={};this.hidden=false;}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
 appendChild(node){this.append(node);return node}
 replaceChildren(...nodes){this.children=[];this.append(...nodes)}
 setAttribute(k,v){this.attributes[k]=v}
 addEventListener(k,fn){this.listeners[k]=fn}
 remove(){this.parent.children=this.parent.children.filter(c=>c!==this)}
}
function find(root,cls){return root.className===cls?root:root.children.map(child=>find(child,cls)).find(Boolean)}
function setup({role='owner',photo='https://lh3.googleusercontent.com/photo',name='Maria Santos'}={}){
 const ids=Object.fromEntries(['memberRefundInbox','memberRefundInboxStatus','memberRefundInboxList','memberRefundInboxCount','memberRefundDashboardStatus','memberRefundMore','memberRefundHistoryStatus'].map(id=>[id,new Element('div')]));
 const item={id:'r',uid:'member',description:'Supplies',amountCents:50000,reimburseTo:'Maria',expenseDate:'2026-11-19',supplier:'Shop',category:'Office',reference:'R1'};
 const state={orgId:'org',uid:'owner',role,memberConfirmed:true,members:[{uid:'member',displayName:name,photoURL:photo}]};
 const window={pondoTeamState:state};const decisions=[];
 const context=vm.createContext({window,funds:[],document:{getElementById:id=>ids[id],createElement:tag=>new Element(tag)},URL,memberRefundPendingSummary:()=>({items:[item]}),memberRefundHistorySummary:()=>({}),memberRefundPendingIssue:()=>'',memberRefundBusy:false,fmt:n=>'₱'+n,dashboardActionAvailability:()=> 'ready',decideMemberRefund:(...args)=>decisions.push(args)});
 vm.runInContext(html.slice(html.indexOf('function notificationActorPhotoURL('),html.indexOf('\nfunction renderNotifCenter()',html.indexOf('function notificationActorPhotoURL('))),context);
 vm.runInContext(html.slice(html.indexOf('function renderMemberRefundInbox(){'),html.indexOf('\nasync function loadOlderMemberRefunds()',html.indexOf('function renderMemberRefundInbox(){'))),context);
 context.renderMemberRefundInbox();return {context,ids,state,item,decisions};
}
test('member refund card presents details and trusted member photo with approval actions',()=>{
 const t=setup(),row=t.ids.memberRefundInboxList.children[0],avatar=find(row,'member-refund-avatar');
 assert.equal(find(row,'member-refund-title').textContent,'Supplies');assert.equal(find(row,'member-refund-status').textContent,'Pending approval');
 assert.match(find(row,'member-refund-detail').textContent,/₱500.*Reimburse Maria.*2026-11-19.*Shop.*Office.*R1/);
 assert.equal(avatar.textContent,'MS');assert.equal(avatar.children[0].src,'https://lh3.googleusercontent.com/photo');assert.equal(avatar.children[0].referrerPolicy,'no-referrer');assert.equal(avatar.attributes['aria-hidden'],'true');
 assert.equal(find(row,'member-refund-person-copy').children[1].textContent,'Maria Santos');
 const actions=find(row,'member-refund-actions');assert.deepEqual(actions.children.map(b=>b.textContent),['Approve','Reject']);actions.children[0].onclick();actions.children[1].onclick();assert.deepEqual(t.decisions,[['r','approved'],['r','rejected']]);
});
test('missing, untrusted, and failed photos show initials; reviewers have no approval buttons',()=>{
 for(const photo of ['', 'https://evil.example/photo','javascript:alert(1)']){const t=setup({role:'reviewer',photo}),row=t.ids.memberRefundInboxList.children[0];assert.equal(find(row,'member-refund-avatar').textContent,'MS');assert.equal(find(row,'member-refund-avatar').children.length,0);assert.equal(find(row,'member-refund-actions'),undefined)}
 const t=setup(),avatar=find(t.ids.memberRefundInboxList.children[0],'member-refund-avatar'),img=avatar.children[0];img.listeners.error();assert.equal(avatar.children.length,0);assert.equal(avatar.textContent,'MS');
});
test('photo selection is scoped to the confirmed workspace and displayed text is not HTML',()=>{
 const t=setup({name:'<script> Test'});let row=t.ids.memberRefundInboxList.children[0];assert.equal(find(row,'member-refund-person-copy').children[1].textContent,'<script> Test');
 t.state.memberConfirmed=false;t.context.renderMemberRefundInbox();row=t.ids.memberRefundInboxList.children[0];assert.equal(find(row,'member-refund-avatar').children.length,0);
 assert.match(html,/renderTeamPanel\(\);\s*window\.renderMemberRefundInbox\?\.\(\)/);
});
