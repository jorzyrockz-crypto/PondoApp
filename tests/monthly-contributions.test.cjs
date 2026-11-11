const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('// Monthly activities keep separate contributor records'),html.indexOf('function contributionPaid(id)'));
function setup({month='2026-01',confirm=true}={}){
 let a={id:'a',title:'School',amount:100,dueDate:'2026-01-31'},people=[{id:'p1',activityId:'a',name:'Ana',expected:100},{id:'p2',activityId:'a',name:'Ben',expected:100}],payments=[{id:'m1',contributorId:'p1',amount:40}];
 let prompts=[month],alerts=[],seq=0,renders=0;
 let c=vm.createContext({contributionSelectedPeriod:{},contributionActivities:[a],contributors:people,contributionPayments:payments,cents:n=>Math.round(n*100),localDate:()=> '2026-01-15',document:{body:{classList:{contains:()=>false}}},appPrompt:async()=>prompts.shift(),appConfirm:async()=>confirm,appAlert:m=>alerts.push(m),makeId:()=>`new${++seq}`,renderAll:()=>renders++});
 vm.runInContext(source,c);
 return {a,people,payments,prompts,alerts,c,run:code=>vm.runInContext(code,c),renders:()=>renders};
}
test('conversion keeps payments intact in the selected first month',async()=>{
 let t=setup();await t.run("convertContributionToMonthly('a')");
 assert.deepEqual(Array.from(t.a.monthlyPeriods),['2026-01']);
 assert.equal(t.people[0].period,'2026-01');assert.equal(t.payments[0].contributorId,'p1');
 let totals=t.run("contributionMonthTotals(contributionActivities[0],'2026-01')");assert.equal(totals.expected,20000);assert.equal(totals.paid,4000);assert.equal(totals.outstanding,16000);
});
test('new month copies roster without carrying payments, isolating history',async()=>{
 let t=setup();await t.run("convertContributionToMonthly('a')");t.prompts.push('2026-02');await t.run("addContributionMonth('a')");
 assert.deepEqual(Array.from(t.a.monthlyPeriods),['2026-01','2026-02']);assert.equal(t.people.length,4);assert.equal(t.payments.length,1);
 let feb=t.run("contributionMonthTotals(contributionActivities[0],'2026-02')");assert.equal(feb.expected,20000);assert.equal(feb.paid,0);
 t.people.find(p=>p.period==='2026-02').name='New name';assert.equal(t.people[0].name,'Ana');
});
test('rejects duplicate or invalid months and handles cancellation',async()=>{
 let t=setup();await t.run("convertContributionToMonthly('a')");t.prompts.push('2026-01','2026-13',null);await t.run("addContributionMonth('a')");await t.run("addContributionMonth('a')");await t.run("addContributionMonth('a')");
 assert.equal(t.a.monthlyPeriods.length,1);assert.equal(t.people.length,2);assert.equal(t.alerts.length,2);
});
test('does not copy roster with pending removal requests',async()=>{
 let t=setup();await t.run("convertContributionToMonthly('a')");t.people[0].pendingDeletion={};t.prompts.push('2026-02');await t.run("addContributionMonth('a')");assert.equal(t.a.monthlyPeriods.length,1);assert.equal(t.people.length,2);assert.match(t.alerts[0],/pending/);
});
test('monthly selection defaults to latest and supports earlier months',async()=>{
 let t=setup();await t.run("convertContributionToMonthly('a')");t.prompts.push('2026-02');await t.run("addContributionMonth('a')");assert.equal(t.run('selectedContributionMonth(contributionActivities[0])'),'2026-02');t.run("contributionSelectedPeriod.a='2026-01'");assert.equal(t.run('selectedContributionMonth(contributionActivities[0])'),'2026-01');
});
test('fund and personal payments stay within their respective month totals',async()=>{
 let t=setup();t.payments[0].method='fund';await t.run("convertContributionToMonthly('a')");t.prompts.push('2026-02');await t.run("addContributionMonth('a')");
 const febPerson=t.people.find(p=>p.period==='2026-02');t.payments.push({id:'m2',contributorId:febPerson.id,amount:25,method:'personal'});
 const jan=t.run("contributionMonthTotals(contributionActivities[0],'2026-01')"),feb=t.run("contributionMonthTotals(contributionActivities[0],'2026-02')");
 assert.equal(jan.fundPaid,4000);assert.equal(jan.personalPaid,0);assert.equal(feb.fundPaid,0);assert.equal(feb.personalPaid,2500);
});
test('archived activities and cancelled conversions are not changed',async()=>{
 let t=setup({confirm:false});await t.run("convertContributionToMonthly('a')");assert.equal(t.a.monthlyPeriods,undefined);assert.equal(t.people[0].period,undefined);
 t.a.archived=true;t.prompts.push('2026-01');await t.run("convertContributionToMonthly('a')");assert.equal(t.a.monthlyPeriods,undefined);
});
