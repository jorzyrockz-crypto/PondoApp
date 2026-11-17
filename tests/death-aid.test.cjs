const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('// Death Aid lives on specially tagged contribution records.'),html.indexOf('let contributionFormContext=null,'));
const escapeText=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function setup(){
 let seq=0;const nodes={deathRemitDate:{value:'2026-11-09'},deathRemitReceiver:{value:'BaPSTEA officer'},deathRemitRole:{value:'Treasurer'},deathCreateForm:{addEventListener(){}}};
 const ctx={window:{pondoTeamState:{orgId:null}},document:{body:{classList:{contains:()=>false}},getElementById:id=>nodes[id]},contributionActivities:[],contributors:[],contributionPayments:[],txs:[],funds:[],auditLog:[],org:{name:'School',location:'Aklan'},localDate:()=> '2026-11-09',cents:n=>Math.round(n*100),parseMoney:s=>/^\d+(\.\d{1,2})?$/.test(s)?Math.round(Number(s)*100):null,fmt:n=>'₱'+Number(n).toLocaleString('en-US'),escapeText,makeId:prefix=>prefix+'-'+(++seq),currentActorStamp:()=>null,appAlert:m=>{ctx.alert=m},appConfirm:async()=>true,appReasonPrompt:async()=> 'Correction',renderAll:()=>{},openContributionPrint:s=>{ctx.printed=s}};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,nodes,run:s=>vm.runInContext(s,ctx)};
}
function activity(id,subject,amt){return {id,title:'Death Aid: '+subject,amount:0,description:'',deathAid:{version:1,subject,details:'',date:'',suggested:amt,payments:[]}};}
function pay(id,memberId,name,amt){return {id,memberId,name,position:'Teacher',amount:amt,date:'2026-11-08',method:'Channel',collectedBy:'Collector'};}
test('three Death Aid activities produce an acknowledgment with the actual paid totals and signatures',()=>{
 const t=setup(),c=t.ctx;for(const [id,name,amt] of [['a','Adelfa',100],['b','Hilda',50],['c','Lolita',50]]){let a=activity(id,name,amt);for(let i=1;i<=8;i++)a.deathAid.payments.push(pay(id+i,'member'+i,'Member '+i,amt));c.contributionActivities.push(a)}
 t.run("deathAidSelection=new Set(['a','b','c'])");c.printDeathAidDraft();for(const s of ['Adelfa','Hilda','Lolita','₱800','₱400','₱1,600','BaPSTEA officer','Signatories','Draft for signature'])assert.ok(c.printed.includes(s),s);assert.equal(c.deathAidRemittanceGroups().length,0);assert.equal(c.txs.length,0);
 c.printDeathAidIndividual('b');assert.match(c.printed,/Death Aid Contribution/);assert.match(c.printed,/₱400/);assert.match(c.printed,/Collected by/);assert.match(c.printed,/Collector/);
});
test('remittances assign payments once; voiding them releases payments and retains audit history',async()=>{
 const t=setup(),c=t.ctx,a=activity('a','Lolita',50);a.deathAid.payments.push(pay('p','m','Member',50));c.contributionActivities.push(a);t.run("deathAidSelection=new Set(['a'])");await c.recordDeathAidRemittance();assert.equal(c.deathAidRemittanceGroups().length,1);assert.equal(a.deathAid.payments[0].remittance.receiver,'BaPSTEA officer');t.run("deathAidSelection=new Set(['a'])");await c.recordDeathAidRemittance();assert.match(c.alert,/unremitted/);assert.equal(c.deathAidRemittanceGroups().length,1);await c.voidDeathAidPayment('a','p');assert.equal(a.deathAid.payments.length,1);let id=a.deathAid.payments[0].remittance.id;await c.voidDeathAidRemittance(id);assert.equal(c.deathAidRemittanceGroups().length,0);assert.equal(c.auditLog[0].action,'void death aid remittance');assert.equal(c.deathAidSelectedPayments().length,1);assert.equal(c.txs.length,0);
});
test('acknowledgments match only explicit member IDs, never same-name guesses',()=>{
 const t=setup(),c=t.ctx,a=activity('a','One',50),b=activity('b','Two',50);a.deathAid.payments.push(pay('p1','member1','Same Name',50));b.deathAid.payments.push(pay('p2','member2','Same Name',50));c.contributionActivities.push(a,b);t.run("deathAidSelection=new Set(['a','b'])");c.printDeathAidDraft();assert.equal((c.printed.match(/Same Name/g)||[]).length,2);
});
test('individual report combines installments for one member and includes payment dates',()=>{
 const {ctx:c}=setup(),a=activity('a','Person',50);a.deathAid.payments.push(pay('p1','member','A',20),{...pay('p2','member','A',30),date:'2026-11-09'});c.contributionActivities.push(a);c.printDeathAidIndividual('a');assert.match(c.printed,/₱50/);assert.match(c.printed,/2026-11-08, 2026-11-09/);assert.equal((c.printed.match(/<td>A<\/td>/g)||[]).length,1);
});
test('backup rejects duplicate IDs, mismatched identities, conflicting remittance data and ordinary contributor links',()=>{
 const {ctx:c}=setup(),a=activity('a','Person',50),b=activity('b','Other',50),p=pay('p','m','Name',50);a.deathAid.payments.push(p);b.deathAid.payments.push(pay('p2','m','Name',50));assert.equal(c.validateDeathAidBackup([a,b],[],[]),true);b.deathAid.payments[0].name='Different';assert.equal(c.validateDeathAidBackup([a,b],[],[]),false);b.deathAid.payments[0].name='Name';b.deathAid.payments[0].id='p';assert.equal(c.validateDeathAidBackup([a,b],[],[]),false);b.deathAid.payments[0].id='p2';p.remittance={id:'r',date:'2026-11-09',receiver:'Officer',role:''};b.deathAid.payments[0].remittance={...p.remittance,receiver:'Other'};assert.equal(c.validateDeathAidBackup([a,b],[],[]),false);assert.equal(c.validateDeathAidBackup([a],[{activityId:'a'}],[]),false);
});
test('public projection excludes private Death Aid data',()=>{
 const {buildPublicReport}=require('../functions/projection.js'),a=activity('a','Private individual',50);a.deathAid.payments.push(pay('p','m','Member',50));const snapshot={funds:[],txs:[],projects:[],allocations:[],contributors:[],contributionPayments:[],contributionActivities:[a]};const output=buildPublicReport(snapshot,{contributions:true});assert.equal(output.contributions.length,0);assert.ok(!JSON.stringify(output).includes('Private individual'));
});
test('dashboard shortcut sits after cash donations and opens the protected Death Aid form',()=>{
 assert.match(html,/id="recordCashDonation"[\s\S]*?id="dashboardRecordDeathAid" onclick="openDashboardDeathAid\(\)" aria-label="Record Death Aid">\+ Aid Record/);
 assert.match(html,/body\.role-reviewer #dashboardRecordDeathAid \{display:none!important\}/);
 const {ctx:c}=setup(),calls=[];c.switchTab=tab=>calls.push(tab);c.showDeathAidCreate=()=>calls.push('form');c.openDashboardDeathAid();assert.deepEqual(calls,['form']);c.window.pondoTeamState={orgId:'team',role:'reviewer',memberConfirmed:true,baselineReady:true};c.openDashboardDeathAid();assert.deepEqual(calls,['form']);
});
test('Death Aid register is below the contribution activity workspace',()=>{
 const page=html.slice(html.indexOf('<section id="tab-contributions"'),html.indexOf('<!-- REPORT -->'));
 assert.ok(page.indexOf('class="contribution-workspace"') < page.indexOf('<section class="death-aid"'));
 assert.ok(page.indexOf('id="contributionCards"') < page.indexOf('id="deathAidTitle"'));
 assert.match(page,/id="recordDeathAid" onclick="showDeathAidCreate\(\)"/);
});

test('Death Aid record form is an accessible modal with guarded access and dismissal',()=>{
 assert.match(html,/id="deathAidFormOverlay" class="contribution-form-overlay no-print" hidden/);
 assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="deathCreateTitle"/);
 assert.match(html,/function showDeathAidCreate\(\)\{if\(!deathAidCanWrite\(\)\)return/);
 assert.match(html,/function closeDeathAidCreate\(restoreFocus=true\)/);
 assert.match(html,/overlay=document.getElementById\('deathAidFormOverlay'\)[\s\S]*?e.key==='Escape'[\s\S]*?e.key==='Tab'/);
});
test('dashboard has a distinct Death Aid card showing actual handover totals, not debts',()=>{
 assert.match(html,/function renderDashboardDeathAidCard\(rail\)/);
 assert.match(html,/renderDashboardDeathAidCard\(rail\)/);
 assert.match(html,/payments.filter\(p=>p.remittance\)/);
 assert.match(html,/Awaiting handover to BaPSTEA; not an unpaid member balance/);
 assert.match(html,/function openDashboardDeathAidRegister\(\)\{if\(!deathAidCanRead\(\)\)return;switchTab\('contributions'\);toggleDeathAidRegister\(true\)/);
});
test('funded payments create exactly one guarded expense and personal payments do not',async()=>{
 const t=setup(),c=t.ctx,a=activity('a','Person',50);c.contributionActivities.push(a);c.funds.push({id:'f',name:'School',initialAmount:100,dateReceived:'2026-01-01'});c.fundAvailable=()=>5000;c.wouldOverdrawAtDate=()=>false;
 const inputs={'.death-member':'','.death-name':'Member A','.death-position':'Teacher','.death-amount':'60','.death-date':'2026-11-08','.death-method':'Cash','.death-collector':'Officer','.death-source':'fund','.death-fund':'f'};
 const fields=Object.fromEntries(Object.entries(inputs).map(([k,value])=>[k,{value}])),form={dataset:{workspace:c.deathAidContext()},isConnected:true,querySelector:key=>fields[key],querySelectorAll:()=>Object.values(fields)};const submit=()=>c.saveDeathAidPayment({preventDefault(){},currentTarget:form},'a');
 await submit();assert.equal(c.txs.length,0);assert.match(c.alert,/Insufficient/);fields['.death-amount'].value='40';await submit();assert.equal(c.txs.length,1);assert.equal(a.deathAid.payments.length,1);assert.equal(c.txs[0].deathAidPaymentId,a.deathAid.payments[0].id);assert.equal(c.validateDeathAidLinks([a],c.txs,c.funds),true);
 fields['.death-source'].value='personal';fields['.death-name'].value='Member B';await submit();assert.equal(c.txs.length,1);assert.equal(a.deathAid.payments.length,2);assert.equal(a.deathAid.payments[1].source,'personal');
 const id=a.deathAid.payments[0].id;a.deathAid.payments[0].remittance={id:'r',date:'2026-11-09',receiver:'Officer',role:''};await c.voidDeathAidPayment('a',id);assert.equal(c.txs.length,1);delete a.deathAid.payments[0].remittance;await c.voidDeathAidPayment('a',id);assert.equal(c.txs.length,0);assert.equal(a.deathAid.payments.length,1);assert.equal(c.auditLog[0].action,'void death aid payment');
});
test('backup validation requires a unique matching fund expense with no orphan links',()=>{
 const t=setup(),c=t.ctx,a=activity('a','Person',50),p={...pay('p','member','Person',30),source:'fund',fundId:'f',txId:'t'},f={id:'f',dateReceived:'2026-01-01'},tx={id:'t',type:'OUT',fundId:'f',date:p.date,amount:30,deathAidPaymentId:'p',deathAidActivityId:'a'};a.deathAid.payments.push(p);
 assert.equal(c.validateDeathAidLinks([a],[tx],[f]),true);assert.equal(c.validateDeathAidLinks([a],[{...tx,amount:31}],[f]),false);assert.equal(c.validateDeathAidLinks([a],[],[f]),false);assert.equal(c.validateDeathAidLinks([],[tx],[f]),false);assert.equal(c.validateDeathAidLinks([a],[{...tx,projectId:'project'}],[f]),false);p.source='personal';assert.equal(c.validateDeathAidLinks([a],[tx],[f]),false);
});
test('fund-linked expenses cannot be assigned or removed independently',()=>{
 assert.match(html,/if\(t\.deathAidPaymentId\)\{await voidDeathAidPayment/);
 assert.match(html,/t\.projectId\|\|t\.contributionPaymentId\|\|t\.deathAidPaymentId/);
 assert.match(html,/Void fund-funded Death Aid payments individually before clearing transactions/);
 assert.match(html,/This fund has Death Aid payments/);
 assert.match(html,/validateDeathAidLinks\(ca,nt,nf\)/);
});
