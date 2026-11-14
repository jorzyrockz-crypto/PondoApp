const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const main=html.slice(html.indexOf('function signatoryBlocks('),html.indexOf('\n\nfunction receiptMarkup'));
const summary=html.slice(html.indexOf('function printContributionSummary(id)'),html.indexOf('\n\n// This report intentionally'));
function create(){
 const a={id:'a',title:'Activity <fund>',description:'Sensitive details',amount:100,dueDate:'2026-03-01',projectId:'project',monthlyPeriods:['2026-01','2026-02']};
 const people=[{id:'p1',name:'Private <name>',expected:100,period:'2026-01'},{id:'p2',name:'Another person',expected:100,period:'2026-02'}];
 const payments=[{contributorId:'p1',date:'2026-01-03',amount:50,method:'fund',fundId:'f',receivedBy:'Receiver <name>',reference:'Secret reference',notes:'Private note'}];
 const r={a,people,payments,totals:{expected:20000,paid:5000,outstanding:15000,personalPaid:0,fundPaid:5000}};
 let target={innerHTML:''},classes=new Set(),after,printed=0;
 const context={sigs:[],org:{name:'Organization <name>'},projects:[{id:'project',name:'Secret project'}],funds:[{id:'f',name:'Fund <one>'}],currentUserDisplayName:()=> 'Person <preparing>',localDate:()=> '2026-03-01',futureRecordCount:()=>1,contributionReport:id=>id==='a'?r:null,monthlyContribution:x=>!!x.monthlyPeriods,contributionPaid:id=>id==='p1'?5000:0,contributionBalance:p=>p.id==='p1'?5000:10000,contributionStatusOf:p=>p.id==='p1'?'Partially paid':'Unpaid',fmt:n=>'₱'+n,escapeText:s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),document:{getElementById:()=>target,body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}},window:{addEventListener:(ev,cb)=>after=cb,print:()=>printed++},setTimeout:()=>{}};
 vm.runInNewContext(main+'\n'+summary,context);return {context,target,classes,after:()=>after(),printed:()=>printed};
}
test('detailed report preserves escaped people, payments, totals, periods and warning',()=>{
 let t=create();t.context.printContribution('a');let s=t.target.innerHTML;
 for(let part of ['Organization &lt;name&gt;','Activity &lt;fund&gt;','Sensitive details','Secret project','Private &lt;name&gt; (2026-01)','Fund &lt;one&gt;','Receiver &lt;name&gt;','Secret reference','Private note','₱200','₱50','₱150','Monthly · all added periods','future-dated records'])assert.ok(s.includes(part),part);
 assert.ok(t.classes.has('contribution-printing'));assert.equal(t.printed(),1);t.after();assert.ok(!t.classes.has('contribution-printing'));
});
test('totals-only report excludes named records, notes and details or project labels',()=>{let t=create();t.context.printContributionSummary('a');let s=t.target.innerHTML;for(let part of ['Private &lt;name&gt;','Another person','Receiver','Secret reference','Private note','Sensitive details','Secret project'])assert.ok(!s.includes(part),part);assert.match(s,/Contributor-month status counts/);assert.match(s,/2 contributor-month records/);assert.match(s,/TOTALS-ONLY REPORT/)});
test('office print styling uses white paper and keeps multi-page table headers',()=>{assert.match(html,/html body\.contribution-printing:not\(\.dark-mode\)\[data-background\]/);assert.match(html,/contribution-office-report thead \{ display:table-header-group/);assert.match(html,/contribution-office-report tr \{ break-inside:avoid/);assert.match(html,/office-payments th:nth-child\(6\)/)});
