const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Financial reports print on paper'),html.indexOf('@media print{.dashboard-refund-alert'));
test('financial report prints white with dark text in both themes, without the app artwork',()=>{
 assert.match(css,/@media print\s*\{/);
 assert.match(css,/html body:not\(\.dark-mode\):not\(\.contribution-printing\),\s*html body\.dark-mode:not\(\.contribution-printing\)\s*\{[\s\S]*?background:#fff!important; background-image:none!important/);
 assert.match(css,/body:not\(\.contribution-printing\) #tab-report #printable-report\s*\{[\s\S]*?overflow:visible!important;[\s\S]*?background:#fff!important/);
 assert.match(css,/#printable-report \* \{\s*color:#171717!important; background:transparent!important/);
 assert.match(css,/\.report-title \{ font:700 18pt\/1\.2 Arial,sans-serif!important/);
});
test('printed tables wrap, paginate and repeat headers without affecting contribution printing',()=>{
 assert.match(css,/\.report-table-wrap \{ overflow:visible!important/);
 assert.match(css,/\.print-payables table,[\s\S]*?\.print-transactions table \{ table-layout:fixed!important/);
 assert.match(css,/thead \{ display:table-header-group/);
 assert.match(css,/tr \{ break-inside:avoid; page-break-inside:avoid/);
 assert.match(css,/overflow-wrap:break-word!important/);
 assert.doesNotMatch(css,/overflow-wrap:anywhere/);
 assert.match(html,/body\.contribution-printing #contributionPrint,body\.contribution-printing #contributionPrint \*\{visibility:visible!important\}/);
});
test('print options and filtered sections remain able to hide the report sections',()=>{
 assert.match(css,/body\.print-hide-summary:not\(\.contribution-printing\) #tab-report #printable-report \.print-summary \{ display:none!important; \}/);
 for(const type of ['projects','payables','tx'])assert.match(html,new RegExp('body\\.print-hide-'+type+' #printable-report'));
 assert.doesNotMatch(html,/print-hide-sigs/);assert.doesNotMatch(html,/id="printSigs"/);
 assert.match(html,/\.report-filter-hidden\{display:none!important\}/);
});
