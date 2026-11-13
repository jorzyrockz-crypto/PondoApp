const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Contribution detail workspace:'),html.indexOf('/* Financial reports print on paper'));
const ui=html.slice(html.indexOf('function openContributionDetails('),html.indexOf('function openContributionForm(',html.indexOf('function openContributionDetails(')));
test('contribution dialog styling is scoped, responsive, and themed',()=>{
 assert.match(html,/detailDialog\.classList\.toggle\('contribution-detail',kind==='Contribution activity'\)/);
 assert.match(css,/\.contribution-detail \.contrib-overview/);
 assert.match(css,/body\.dark-mode \.contribution-detail/);
 assert.match(css,/@media \(max-width:700px\)/);assert.match(css,/@media \(max-width:600px\)/);
 assert.match(css,/safe-area-inset-bottom/);assert.match(css,/\.contrib-person-actions \.contrib-pay \{ height:44px/);
});
test('monthly scope and progress reflect selected period with accurate limitations',()=>{
 for(const v of ['selectedContributionMonth(a)','contributionMonthTotals(a,month)','contributionPeopleForMonth(a,month)','Reports and activity cards include all added months','Monthly due dates and automatic reminders are not yet tracked','MONTH TRACKING IS OFF','Make monthly','role="progressbar"','aria-valuenow="${pct}"'])assert.ok(ui.includes(v),v);
 assert.match(ui,/totals\.expected>0\?Math\.min\(100,Math\.max\(0,Math\.round\(totals\.paid\/totals\.expected\*100\)\)\):0/);
 assert.ok(ui.includes('contributionExpectationDescription(a,month)'));
});
test('contributor actions, searches, reports and expansion state are preserved',()=>{
 for(const v of ['contrib-month-select','contrib-add-month','contrib-monthly-convert','contrib-add-person','contrib-bulk','contrib-batch','contrib-person-search','contrib-status-filter','contrib-edit-person','contrib-person-history','contrib-remove-person','contrib-pay','contrib-void','contrib-export','contrib-print','contrib-export-summary','contrib-print-summary','contrib-archive','contrib-delete-activity','pendingDeletionBadge','secondaryOpen','oldOpen','escapeText(p.name)'])assert.ok(ui.includes(v),v);
 assert.match(ui,/Personal payments do not affect fund balances/);
 assert.match(ui,/Fund-funded payments reduce uncommitted fund cash/);
});
test('compact overview retains touch targets, counts and monthly information',()=>{
 const compact=html.slice(html.indexOf('/* Compact contribution overview'),html.indexOf('/* Financial reports print on paper'));
 assert.match(compact,/\.contrib-period \{ padding:10px 14px/);
 assert.match(compact,/\.contrib-overview-meta \{ display:flex; flex-wrap:wrap/);
 assert.match(compact,/\.contrib-primary-actions \{ margin:10px 0 14px/);
 for(const label of ['MONTH TRACKING IS OFF','MONTHLY TRACKING','Figures and contributors below are for this month','Reports and activity cards include all added months','Personal payments','Paid by fund','counts.Paid','counts.Unpaid','contrib-progress','contrib-add-person','contrib-batch','contrib-bulk'])assert.ok(ui.includes(label),label);
});
