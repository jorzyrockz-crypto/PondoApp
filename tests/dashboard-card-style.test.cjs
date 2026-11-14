const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('dashboard card refresh leaves the desktop grid and sidebar layout unchanged',()=>{
 const start=html.indexOf('/* Dashboard cards only:'),end=html.indexOf('</style>',start);assert.ok(start>=0&&end>start);
 const css=html.slice(start,end);
 assert.doesNotMatch(css,/dashboard-desktop-grid|dashboard-side-column|grid-template-columns|flex-basis|overflow-x/);
 assert.match(css,/dashboard-contribution-track span \{background:#008452!important\}/);
 assert.match(css,/#dashboardContributionCards > \.dashboard-contribution-card \{min-height:0!important\}/);
 assert.match(html,/\.dashboard-desktop-grid\{display:grid;grid-template-columns:minmax\(0,2fr\) minmax\(290px,1fr\)/);
 assert.match(html,/\$\{fmt\(totals\.outstanding\/100\)\} to go/);
 assert.match(html,/openFundDetails\(card\.dataset\.fundId\)/);assert.match(html,/card\.querySelector\('button'\)\.onclick=\(\)=>openContributionDetails\(a\.id\)/);
});
