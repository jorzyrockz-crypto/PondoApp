const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('// Cash donations are metadata'),html.indexOf('function handleFab(){'));
function setup(){
 const values={donationMode:'new',donationExisting:'',donationFundSelect:'',donationDonor:'Community Partner',donationAmount:'250.50',donationDate:'2026-06-01',donationFundName:'',donationProject:'Library',donationReceipt:'R-1',donationMethod:'Transfer',donationDpdsRef:'DP-1',donationDpdsStatus:'not-checked',donationNotes:'',donationImage:'',donationImageCamera:''};
 const els={};for(const [id,value] of Object.entries(values))els[id]={value,files:[]};els['fabSave-donation']={disabled:false};els.fabSheet={classList:{contains:()=>true}};
 const alerts=[],ctx={trackerFatal:false,saveAll:async()=>true,window:{pondoTeamState:{orgId:null},pondoCurrentUser:{uid:'u'}},document:{body:{classList:{contains:()=>false}},getElementById:id=>els[id]},funds:[{id:'fund',name:'School',dateReceived:'2026-01-01',initialAmount:0}],projects:[],txs:[],auditLog:[],contributionPayments:[],appAlert:m=>alerts.push(m),appConfirm:async()=>true,readReceipt:async()=>null,parseMoney:s=>{if(!/^\d+(\.\d{1,2})?$/.test(s))return null;return Math.round(Number(s)*100)},cents:n=>Math.round(n*100),fundCash:()=>0,validateActualDate:()=>true,makeId:p=>p+'-test',currentActorStamp:()=>null,closeFabSheet:()=>{},renderAll:()=>{},soundEvent:()=>{},JSON,Number,String};
 vm.createContext(ctx);vm.runInContext(source+'\nlet cashDonationFormToken=0; cashDonationOpenContext=donationContext();',ctx);return {ctx,els,alerts};
}
test('new donation records exactly one income, with a reference-only project',async()=>{
 let {ctx}=setup();await ctx.saveCashDonation();assert.equal(ctx.txs.length,1);let t=ctx.txs[0];assert.equal(t.type,'IN');assert.equal(t.amount,250.5);assert.equal(t.fundId,'f-test');assert.equal(ctx.funds[1].initialAmount,0);assert.equal(ctx.funds[1].donationFund,true);assert.equal(t.projectId,null);assert.equal(t.payee,'Community Partner');assert.equal(t.cashDonation.project,'Library');assert.equal(ctx.auditLog.length,0);
});
test('link and edit annotate an existing income without changing its amount or adding another',async()=>{
 let {ctx,els}=setup();ctx.txs.push({id:'one',type:'IN',fundId:'fund',date:'2026-06-01',description:'Income',amount:300,payee:'Original'});els.donationMode.value='link';els.donationExisting.value='one';await ctx.saveCashDonation();assert.equal(ctx.txs.length,1);assert.equal(ctx.txs[0].amount,300);assert.equal(ctx.txs[0].payee,'Original');assert.equal(ctx.txs[0].cashDonation.donor,'Community Partner');assert.equal(ctx.auditLog.length,1);
 vm.runInContext("cashDonationEditing='one';cashDonationEditVersion=JSON.stringify(txs[0])",ctx);els.donationDpdsStatus.value='checked';await ctx.saveCashDonation();assert.equal(ctx.txs.length,1);assert.equal(ctx.txs[0].cashDonation.dpdsStatus,'checked');assert.equal(ctx.auditLog.length,2);
});
test('duplicate linking, invalid values, and reviewer writes are rejected',async()=>{
 let {ctx,els,alerts}=setup();ctx.txs.push({id:'one',type:'IN',fundId:'fund',date:'2026-06-01',description:'Income',amount:300,cashDonation:{donor:'A',project:'',dpdsRef:'',dpdsStatus:'not-checked',notes:''}});els.donationMode.value='link';els.donationExisting.value='one';await ctx.saveCashDonation();assert.equal(ctx.txs.length,1);assert.match(alerts[0],/already linked/);
 els.donationMode.value='new';els.donationAmount.value='0';await ctx.saveCashDonation();assert.equal(ctx.txs.length,1);ctx.window.pondoTeamState={orgId:'team',role:'reviewer'};els.donationAmount.value='20';await ctx.saveCashDonation();assert.equal(ctx.txs.length,1);
});
test('a workspace or matching income change while a receipt is loading stops the save',async()=>{
 for(const change of ['workspace','duplicate']){let {ctx,alerts}=setup(),resolve;ctx.readReceipt=()=>new Promise(r=>resolve=r);let promise=ctx.saveCashDonation();await Promise.resolve();if(change==='workspace')ctx.window.pondoTeamState.orgId='other';else ctx.txs.push({id:'new',type:'IN',fundId:'fund',date:'2026-06-01',amount:250.5,payee:'Community Partner'});resolve(null);await promise;assert.equal(ctx.txs.length,change==='duplicate'?1:0);assert.ok(alerts.length);}
});
test('backup validation restricts donation metadata to valid income references',()=>{
 const {ctx}=setup(),good={donor:'A',project:'',dpdsRef:'',dpdsStatus:'checked',notes:''};assert.equal(ctx.validCashDonation(good,'IN'),true);assert.equal(ctx.validCashDonation(good,'OUT'),false);assert.equal(ctx.validCashDonation({...good,dpdsStatus:'submitted'},'IN'),false);assert.match(html,/t\.cashDonation!=null&&!validCashDonation\(t\.cashDonation,t\.type\)/);
});
test('dashboard access, manual DPDS language and signed filtered print remain available',()=>{
 assert.match(html,/id="recordCashDonation" onclick="openCashDonation\(\)"/);assert.match(html,/id="donationRegisterTitle" tabindex="0"[\s\S]*?<strong>Cash donations/);assert.match(html,/Not an automatic submission or confirmation/);assert.match(source,/function printCashDonations\(\)[\s\S]*cashDonationRows\(\)[\s\S]*signatorySection\(\)/);assert.match(source,/body\.classList\.contains\('role-reviewer'\)/);assert.match(html,/Attachments stay on this device/);
});

test('linking cannot turn a mixed or fundraising fund into a donation source',async()=>{
 let {ctx,els}=setup();ctx.txs.push({id:'a',type:'IN',fundId:'fund',date:'2026-06-01',amount:100},{id:'b',type:'IN',fundId:'fund',date:'2026-06-01',amount:100});els.donationMode.value='link';els.donationExisting.value='a';await ctx.saveCashDonation();assert.equal(ctx.funds[0].donationFund,undefined);assert.equal(ctx.txs[0].cashDonation,undefined);ctx.txs.pop();ctx.txs[0].contributionPaymentId='payment';assert.equal(ctx.eligibleDonationIncome(ctx.txs[0]),false);ctx.txs[0].contributionPaymentId=null;ctx.funds[0].initialAmount=1;assert.equal(ctx.eligibleDonationIncome(ctx.txs[0]),false);
});
test('donation funds prevent extra income and enforce a backup invariant',()=>{assert.match(html,/type==='IN'&&isDonationFund/);assert.match(html,/if\(isDonationFund\(f\)\)\{appAlert\('Choose a different fund/);assert.match(html,/incomes.some\(t=>!validCashDonation\(t.cashDonation/);assert.match(html,/cash-donation-fund-card/);assert.match(html,/function openCashDonationFunds/);});

test('usage groups each dedicated fund once and excludes shared fund spending',()=>{
 const {ctx}=setup();ctx.funds.push({id:'dedicated',initialAmount:0,donationFund:true});ctx.fundCash=id=>id==='dedicated'?7000:99900;ctx.txs.push({type:'OUT',fundId:'dedicated',amount:30},{type:'OUT',fundId:'fund',amount:500});let usage=ctx.cashDonationUsage([{fundId:'dedicated'},{fundId:'dedicated'},{fundId:'fund'}]);assert.equal(usage.spent,3000);assert.equal(usage.balance,7000);
});
test('empty donation shortcut matches rail empty states and remains keyboard accessible',()=>{
 assert.match(html,/if\(!donationFunds\.length\)[\s\S]*?class="empty-state cash-donation-fund-card cash-donation-empty" role="button" tabindex="0"[\s\S]*?emptyArt\('donation'\)[\s\S]*?No cash donations yet/);
 assert.match(html,/querySelectorAll\('\.fund-card, \.cash-donation-empty'\)[\s\S]*?card\.addEventListener\('keydown'/);
 assert.match(html,/body\.dark-mode \.empty-illustration-donation/);
});
test('transaction filters distinguish donations, fundraising and Death Aid fund expenses',()=>{
 const {ctx}=setup();assert.equal(ctx.transactionTypeMatches({type:'IN',cashDonation:{}},'DONATION'),true);assert.equal(ctx.transactionTypeMatches({type:'OUT',deathAidPaymentId:'p'},'DEATH_AID'),true);assert.equal(ctx.transactionTypeMatches({type:'IN',contributionPaymentId:'p'},'RAISED'),true);assert.equal(ctx.transactionTypeMatches({type:'OUT',contributionPaymentId:'p'},'CONTRIBUTION'),true);assert.equal(ctx.transactionTypeMatches({type:'OUT',deathAidPaymentId:'p'},'PERSONAL'),false);assert.equal(ctx.transactionKind({type:'OUT',deathAidPaymentId:'p'}),'Death Aid · Fund expense');
 assert.match(html,/Personal Death Aid activity/);assert.match(html,/Personal payment · no fund impact/);assert.match(html,/#txList\[hidden\]/);
});

test('multiple individual receipts can use a donation fund without mixing ordinary income',async()=>{
 const {ctx,els}=setup();ctx.funds.push({id:'pool',name:'Community fund',initialAmount:0,dateReceived:'2026-01-01',donationFund:true});els.donationFundSelect.value='pool';ctx.txs.push({id:'first',type:'IN',fundId:'pool',date:'2026-02-01',amount:50,description:'Donation',cashDonation:{donor:'First',project:'',dpdsRef:'',dpdsStatus:'not-checked',notes:''}});await ctx.saveCashDonation();assert.equal(ctx.funds.length,2);assert.equal(ctx.txs.length,2);assert.equal(ctx.txs[1].fundId,'pool');assert.equal(ctx.txs[1].amount,250.5);assert.equal(ctx.txs[1].cashDonation.donor,'Community Partner');assert.equal(ctx.txs[0].cashDonation.donor,'First');
 ctx.txs.push({id:'ordinary',type:'IN',fundId:'pool',date:'2026-02-02',amount:1});assert.equal(ctx.eligiblePooledDonationFund(ctx.funds[1]),false);
});
test('pooled receipts reject earlier dates, pending deletion, unsafe totals and fund changes during async reads',async()=>{
 for(const change of ['date','pending','overflow','changed']){const {ctx,els,alerts}=setup();const f={id:'pool',name:'Community fund',initialAmount:0,dateReceived:'2026-05-01',donationFund:true};ctx.funds.push(f);els.donationFundSelect.value='pool';if(change==='date')els.donationDate.value='2026-01-01';if(change==='pending')f.pendingDeletion={};if(change==='overflow')ctx.txs.push({id:'large',type:'IN',fundId:'pool',date:'2026-05-01',amount:90071992547409,cashDonation:{donor:'A',project:'',dpdsRef:'',dpdsStatus:'not-checked',notes:''}});if(change==='changed'){let resolve;ctx.readReceipt=()=>new Promise(r=>resolve=r);const p=ctx.saveCashDonation();await Promise.resolve();f.pendingDeletion={};resolve(null);await p;}else await ctx.saveCashDonation();assert.equal(ctx.txs.some(t=>t.cashDonation?.donor==='Community Partner'),false,change);assert.ok(alerts.length,change);}
});
