const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function uniqueDescriptionValues('),html.indexOf('\nfunction handleFab()'));
class Element{
 constructor(){this.children=[];this.value='';this.textContent='';this.hidden=false;this.isConnected=true;this.focused=false;}
 appendChild(child){this.children.push(child)} replaceChildren(...children){this.children=children;this.value=''} focus(){this.focused=true}
}
function setup(){
 const ids={};for(const name of ['fabTxType','txDescriptionSuggestions','payableDescriptionSuggestions','projectNameSuggestions','projectDescriptionSuggestions','activityTitleSuggestions','activityDescriptionSuggestionLabel','activityDescriptionSuggestion','cActivityDescription'])ids[name]=new Element();ids.fabTxType.value='OUT';
 const state={orgId:null};const ctx=vm.createContext({window:{pondoTeamState:state,pondoCurrentUser:{uid:'user'}},document:{getElementById:id=>ids[id]||null,createElement:()=>new Element()},txs:[],payables:[],projects:[],contributionActivities:[],payableContext:{kind:'advance'},appConfirm:async()=>true});vm.runInContext(source,ctx);return {ctx,ids,state};
}
const values=el=>el.children.map(o=>o.value);
test('groups by transaction and payable type and keeps values text-only and deduplicated',()=>{
 const {ctx:c,ids}=setup();c.txs.push({type:'IN',description:'Donation'}, {type:'OUT',description:' Supplies '},{type:'OUT',description:'supplies'},{type:'OUT',description:'<img src=x onerror=alert(1)>'},{type:'OUT',description:'   '});c.payables.push({kind:'advance',description:'Taxi'},{kind:'supplier',description:'Printing'});c.projects.push({name:'Training',description:'Workshop'}, {name:'training',description:'Workshop'});c.contributionActivities.push({title:'Dues',description:'Annual support'});
 c.refreshDescriptionSuggestions();assert.deepEqual(values(ids.txDescriptionSuggestions),['<img src=x onerror=alert(1)>','supplies']);assert.deepEqual(values(ids.payableDescriptionSuggestions),['Taxi']);assert.deepEqual(values(ids.projectNameSuggestions),['training']);assert.deepEqual(values(ids.projectDescriptionSuggestions),['Workshop']);assert.deepEqual(values(ids.activityTitleSuggestions),['Dues']);assert.deepEqual(values(ids.activityDescriptionSuggestion),['','Annual support']);assert.equal(ids.activityDescriptionSuggestionLabel.hidden,false);
 ids.fabTxType.value='IN';c.payableContext.kind='supplier';c.refreshDescriptionSuggestions();assert.deepEqual(values(ids.txDescriptionSuggestions),['Donation']);assert.deepEqual(values(ids.payableDescriptionSuggestions),['Printing']);
});
test('suggestions use current workspace and hide while team access and data are unconfirmed',()=>{
 const {ctx:c,ids,state}=setup();c.projects.push({name:'Personal'});c.refreshDescriptionSuggestions();assert.deepEqual(values(ids.projectNameSuggestions),['Personal']);
 state.orgId='team';state.role='owner';state.memberConfirmed=false;state.baselineReady=false;c.refreshDescriptionSuggestions();assert.deepEqual(values(ids.projectNameSuggestions),[]);state.memberConfirmed=true;state.baselineReady=true;c.projects=[{name:'Team'}];c.refreshDescriptionSuggestions();assert.deepEqual(values(ids.projectNameSuggestions),['Team']);c.clearDescriptionSuggestions();assert.deepEqual(values(ids.projectNameSuggestions),[]);assert.equal(ids.activityDescriptionSuggestionLabel.hidden,true);
});
test('empty, invalid and removed records do not create suggestions; results are bounded',()=>{
 const {ctx:c,ids}=setup();c.projects.push(null,{name:null},{name:'  '},...Array.from({length:130},(_,i)=>({name:'Project '+i})));c.refreshDescriptionSuggestions();assert.equal(ids.projectNameSuggestions.children.length,100);assert.equal(ids.projectNameSuggestions.children[0].value,'Project 129');c.projects=[];c.refreshDescriptionSuggestions();assert.equal(ids.projectNameSuggestions.children.length,0);assert.equal(ids.activityDescriptionSuggestionLabel.hidden,true);
});
test('choosing contribution description is explicit and confirms before replacing typed text',async()=>{
 const {ctx:c,ids}=setup();c.contributionActivities.push({description:'Previous text'});c.refreshDescriptionSuggestions();const select=ids.activityDescriptionSuggestion,target=ids.cActivityDescription;select.value='Previous text';await select.onchange({currentTarget:select});assert.equal(target.value,'Previous text');assert.equal(target.focused,true);
 target.value='My draft';select.value='Previous text';c.appConfirm=async()=>false;await select.onchange({currentTarget:select});assert.equal(target.value,'My draft');
 c.appConfirm=async()=>true;select.value='Previous text';await select.onchange({currentTarget:select});assert.equal(target.value,'Previous text');
});
test('workspace, record or draft changes during confirmation prevent stale replacement',async()=>{
 const {ctx:c,ids,state}=setup();c.contributionActivities.push({description:'Previous text'});c.refreshDescriptionSuggestions();const select=ids.activityDescriptionSuggestion,target=ids.cActivityDescription;let resolve;c.appConfirm=()=>new Promise(r=>resolve=r);target.value='My draft';select.value='Previous text';let pending=select.onchange({currentTarget:select});state.orgId='other';resolve(true);await pending;assert.equal(target.value,'My draft');
 state.orgId=null;select.value='Previous text';pending=select.onchange({currentTarget:select});target.value='Changed draft';resolve(true);await pending;assert.equal(target.value,'Changed draft');
 target.value='My draft';select.value='Previous text';pending=select.onchange({currentTarget:select});c.contributionActivities=[];resolve(true);await pending;assert.equal(target.value,'My draft');
});
test('form hooks and workspace lifecycle keep suggestions current without persisting separate data',()=>{
 for(const id of ['txDescriptionSuggestions','payableDescriptionSuggestions','projectNameSuggestions','projectDescriptionSuggestions','activityTitleSuggestions'])assert.ok(html.includes('list="'+id+'"'));
 assert.match(html,/function renderAll\(\)\{\s*renderDashboardActions\(\);\s*refreshDescriptionSuggestions\(\)/);assert.match(html,/window\.clearDescriptionSuggestions\) window\.clearDescriptionSuggestions\(\)/);assert.match(html,/payableContext=\{projectId:p\?p\.id:null,payableId:null,kind\}/);
 assert.doesNotMatch(source,/saveAll\(|localStorage|pondoCloudSync/);
});
