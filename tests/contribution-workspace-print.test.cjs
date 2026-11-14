const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function printContributionWorkspaceSummary()'),html.indexOf('function validateActualDate(date,label)'));
function setup({empty=false,future=0}={}){
 let target={innerHTML:''},classes=new Set(),after,printed=0,scheduled=0;
 const activities=empty?[]:[{id:'a',title:'School <books>'},{id:'b',title:'Monthly fund',archived:true,monthlyPeriods:['2026-01','2026-02']}];
 const records={a:{expected:10000,paid:2500,outstanding:7500,personalPaid:2500,fundPaid:0},b:{expected:20000,paid:10000,outstanding:10000,personalPaid:0,fundPaid:10000}};
 const sum=items=>items.reduce((s,a)=>{for(const k of Object.keys(s))s[k]+=records[a.id][k];return s},{expected:0,paid:0,outstanding:0,personalPaid:0,fundPaid:0});
 let context={signatorySection:()=>'<section>Signatories</section>',contributionActivities:activities,contributionTotalsForActivities:sum,contributionTotals:id=>records[id],monthlyContribution:a=>!!a.monthlyPeriods,org:{name:'Example <org>'},fmt:n=>'₱'+n,escapeText:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),futureRecordCount:()=>future,localDate:()=> '2026-01-31',document:{getElementById:()=>target,body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}},window:{print:()=>printed++,addEventListener:(event,cb,options)=>{assert.equal(event,'afterprint');assert.equal(options.once,true);after=cb}},setTimeout:()=>scheduled++};
 vm.runInNewContext(source,context);context.printContributionWorkspaceSummary();return {target,classes,printed,scheduled,cleanup:()=>after()};
}
test('workspace report includes all activity totals without contributor details',()=>{
 let t=setup(),text=t.target.innerHTML;assert.match(text,/Example &lt;org&gt;/);assert.match(text,/School &lt;books&gt;/);assert.match(text,/Monthly fund \(Archived\) · Monthly, all periods/);assert.match(text,/Expected<\/span><strong>₱300/);assert.match(text,/Total paid<\/span><strong>₱125/);assert.match(text,/Outstanding<\/span><strong>₱175/);assert.match(text,/Personal paid<\/span><strong>₱25/);assert.match(text,/Fund-funded paid<\/span><strong>₱100/);assert.match(text,/Search and filters do not affect/);assert.doesNotMatch(text,/PRIVATE NAME|payment history|receipt|reference/i);assert.equal(t.printed,1);assert.ok(t.classes.has('contribution-printing'));assert.equal(t.scheduled,1);t.cleanup();assert.ok(!t.classes.has('contribution-printing'));
});
test('empty and future-dated workspaces get explicit report states',()=>{assert.match(setup({empty:true}).target.innerHTML,/No contribution activities recorded/);assert.match(setup({future:1}).target.innerHTML,/future-dated records/);assert.doesNotMatch(setup().target.innerHTML,/future-dated records/)});
test('print control explains its scope, preserves per-activity reports, and isolates the printout',()=>{
 assert.match(html,/onclick="printContributionWorkspaceSummary\(\)"/);assert.match(html,/including archived activities and all months/);assert.match(html,/contrib-print-summary/);assert.match(html,/function printContributionSummary\(id\)/);assert.match(html,/body\.contribution-printing #pondoApp > :not\(#contributionPrint\) \{ display:none!important; \}/);assert.match(html,/contribution-workspace-report thead \{ display:table-header-group/);
});
