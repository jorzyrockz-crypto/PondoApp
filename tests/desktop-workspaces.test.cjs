const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Wider workspaces for desktop pointers only.'),html.indexOf('@media print{.dashboard-refund-alert'));
const section=(id,next)=>html.slice(html.indexOf('<section id="tab-'+id+'"'),html.indexOf(next,html.indexOf('<section id="tab-'+id+'"')));
test('desktop pointer layouts widen the existing workspace without forcing tablet or print grids',()=>{
 assert.match(css,/@media screen and \(min-width:1200px\) and \(not \(pointer:coarse\)\)/);
 assert.match(css,/main\.wrap \{ max-width:1500px!important/);
 assert.match(css,/#tab-funds #fundsList, #tab-projects #projectsList \{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/#tab-contributions \.contribution-workspace \.contribution-cards \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.desktop-transactions-layout \{ display:grid/);
 assert.match(css,/#tab-refunds \.refund-workspace \{ display:grid/);
 assert.match(css,/\.desktop-report-layout \{ display:grid/);
 assert.match(css,/body\.dark-mode #tab-refunds \.refund-workspace \.refund-log-section/);
});
test('transaction and report wrappers retain existing controls and printed report',()=>{
 const tx=section('transactions','<!-- REFUND HISTORY -->');
 assert.ok(tx.indexOf('desktop-transactions-main')<tx.indexOf('id="txSearch"'));
 assert.ok(tx.indexOf('id="txList"')<tx.indexOf('class="audit-panel"'));
 const report=section('report','</main>');
 for(const id of ['reportFund','reportFrom','reportTo','printSummary','reportTotalReceived','printable-report','reportFundsTable','reportTxTable','reportSigs'])assert.ok(report.includes('id="'+id+'"'),id);
 assert.ok(report.indexOf('desktop-report-tools no-print')<report.indexOf('desktop-report-preview'));
 assert.ok(report.indexOf('desktop-report-preview')<report.indexOf('id="printable-report"'));
 assert.match(html,/@media print\s*\{[\s\S]*?#printable-report,#printable-report \*\{visibility:visible!important\}/);
});
test('desktop secondary navigation matches primary active tabs in both themes',()=>{
 const nav=html.slice(html.indexOf('/* Match exposed secondary destinations'),html.indexOf('/* Wider workspaces'));
 assert.match(nav,/@media screen and \(min-width:1024px\)/);
 assert.match(nav,/button\.active \{[\s\S]*?background:#eef2ff!important; color:#4f46e5!important; box-shadow:none!important/);
 assert.match(nav,/button\.active > span:not\(\.nav-more-icon\) \{[\s\S]*?color:#4f46e5!important; font-size:0\.9rem!important; font-weight:650!important/);
 assert.match(nav,/button\.active \.nav-more-icon svg \{[\s\S]*?stroke:#4f46e5!important/);
 assert.match(nav,/body\.dark-mode \.bottomnav \.nav-more-menu button\.active \{[\s\S]*?background:#272b61!important; color:#f4f7ff!important/);
 assert.match(nav,/body\.dark-mode \.bottomnav \.nav-more-menu button\.active > span:not\(\.nav-more-icon\) \{ color:#f4f7ff!important/);
});
test('workspace summary cards retain labels and values with decorative icons and readable dark values',()=>{
 for(const id of ['fundSourceCount','fundSourceReceived','fundSourceBalance','projectCount','projectAllocated','projectPaid','projectOutstanding','contribActivityCount','contribExpected','contribPaid','contribOutstanding']){
  assert.match(html,new RegExp('<div><svg class="workspace-summary-icon" aria-hidden="true"[^>]*>[\\s\\S]*?</svg><span(?: id="contribActivityScope")?>[^<]*</span><strong id="'+id+'">'));
 }
 assert.match(html,/body\.dark-mode #tab-funds \.fund-page-summary strong,\s*body\.dark-mode #tab-projects \.projects-page-summary strong \{ color:#8eb5ff!important; \}/);
 assert.match(html,/body\.dark-mode #tab-contributions \.contribution-page-summary strong \{ color: #8eb5ff !important; \}/);
 assert.match(html,/#tab-funds \.source-card-name h3, #tab-projects \.project-card-name h3,\s*#tab-contributions \.contribution-card h3 \{ font-weight:700!important; \}/);
 assert.match(html,/class="project-card-identity"><span class="fund-icon" aria-hidden="true"[^>]*>\$\{LICON\('folder',cc\.hex,20\)\}/);
 assert.match(html,/id="contribActivityScope"[^>]*>Active activities<\/span>/);
 assert.match(html,/getElementById\('contribActivityScope'\)\.textContent=/);
});
test('desktop hover does not create another selected item, and keyboard focus remains visible',()=>{
 assert.match(html,/\.nav-more-menu button:not\(\.active\):hover:not\(:focus-visible\) \{ background:transparent!important; box-shadow:none!important; \}/);
 assert.match(html,/\.nav-more-menu button:focus-visible \{ outline:2px solid #6c5cff!important/);
});
test('header tagline displays the full Pondo name without a fixed-width cutoff',()=>{
 assert.match(html,/<div class="org-meta app-tagline">Track and manage your funds with Pondo\.<\/div>/);
 assert.match(html,/\.topbar \.app-tagline \{ display:block!important; max-width:none!important; white-space:normal!important; overflow:visible!important; \}/);
});
