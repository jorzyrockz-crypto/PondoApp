const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const ui=html.slice(html.indexOf('function openContributionDetails('),html.indexOf('function openContributionForm(',html.indexOf('function openContributionDetails(')));
const css=html.slice(html.indexOf('/* Tabular contributor ledger;'),html.indexOf('/* Financial reports print on paper'));
test('contributor data has semantic headers, current amounts and labeled actions',()=>{
 assert.match(ui,/<table class="contrib-table" role="table" aria-label="Contributors">/);
 for(const name of ['Contributor','Expected','Paid','Balance','Status','Action'])assert.ok(ui.includes(`</span>${name}</th>`),name);
 for(const value of ['scope="row"','escapeText(p.name)','fmt(p.expected)','fmt(contributionPaid(p.id)/100)','fmt(contributionBalance(p)/100)','contrib-status','aria-label="Record payment for ${attr(p.name)}"','aria-label="Payment history and options for ${attr(p.name)}"'])assert.ok(ui.includes(value),value);
});
test('the table keeps the current month, filters, expansion, history and editing controls',()=>{
 for(const value of ['selectedContributionMonth(a)','contributionPeopleForMonth(a,month)','contributionStatusOf(p)','contrib-person-search','contrib-status-filter',"oldOpen[p.id]?'open':''",'pendingDeletionBadge(p,\'contributor\',p.id)','contrib-void','contrib-person-history','contrib-edit-person','contrib-remove-person','No matching contributors.','No contributors yet.'])assert.ok(ui.includes(value),value);
});
test('table becomes labeled stacked rows on phones and supports dark mode',()=>{
 assert.match(css,/@media \(max-width:700px\)/);assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/content:attr\(data-label\)/);assert.match(css,/body\.dark-mode \.contribution-detail \.contrib-table/);
});
test('reference-inspired table keeps history controls associated and accessible',()=>{
 for(const value of ['contrib-avatar','contrib-history-toggle','aria-controls="contrib-details-${index}"','aria-expanded="${oldOpen[p.id]',"row.hidden=!details.open","details.addEventListener('toggle',sync)", 'contrib-balance-zero','Total contributors:', 'contrib-status-icon'])assert.ok(ui.includes(value),value);
 assert.match(html,/if\(row\)row\.hidden=false/);
 assert.match(html,/button\.setAttribute\('aria-expanded','true'\)/);
 assert.match(html,/\.contrib-history-row\[hidden\] \{ display:none!important; \}/);
});
test('contributor initials handle names without rendering markup',()=>{
 const vm=require('node:vm'),source=html.slice(html.indexOf('function contributorInitials('),html.indexOf('function openContributionDetails('));const c=vm.createContext({});vm.runInContext(source,c);
 assert.equal(c.contributorInitials('Nora Reyes'),'NR');assert.equal(c.contributorInitials('  Mae   Navarro Silva  '),'MN');assert.equal(c.contributorInitials('Ana'),'A');assert.equal(c.contributorInitials(''),'?');
 assert.ok(ui.includes('escapeText(contributorInitials(p.name))'));
});
