const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function formatOrganizationPeriod('),end=html.indexOf("const CINEMA_TAB_ORDER=",start);assert.ok(start>=0&&end>start);
function setup(){const search={value:'old search'},filter={value:'',focus(options){this.focused=options}},calls=[],extras={ledgerFund:{value:'x'},ledgerFrom:{value:'x'},ledgerTo:{value:'x'},ledgerImpact:{value:'NONE'}};const c=vm.createContext({document:{getElementById:id=>({txSearch:search,txTypeFilter:filter,...extras}[id])},switchTab:tab=>calls.push(tab),renderUnifiedLedger:()=>calls.push('render')});vm.runInContext(html.slice(start,end),c);return {c,search,filter,calls};}
test('organization period is readable, handles different years and preserves unset values',()=>{
 const {c}=setup();assert.equal(c.formatOrganizationPeriod('2026-01-01','2026-12-31'),'Jan 1 – Dec 31, 2026');assert.equal(c.formatOrganizationPeriod('2025-12-25','2026-01-02'),'Dec 25, 2025 – Jan 2, 2026');assert.equal(c.formatOrganizationPeriod('','2026-01-02'),'Not set – 2026-01-02');assert.equal(c.formatOrganizationPeriod('2026-02-30','2026-03-01'),'2026-02-30 – 2026-03-01');
});
test('KPI shortcuts reset stale search and navigate to the requested transaction type',()=>{
 for(const value of ['IN','OUT','all']){const {c,search,filter,calls}=setup();c.openDashboardTransactions(value);assert.equal(search.value,'');assert.equal(filter.value,value);assert.deepEqual(calls,['transactions','render']);assert.equal(filter.focused.preventScroll,true);}
 const t=setup();t.c.openDashboardTransactions('unknown');assert.deepEqual(t.calls,[]);
});
test('KPI shortcuts support Enter and Space without activating for unrelated keys',()=>{
 for(const key of ['Enter',' ']){const t=setup();let prevented=false;t.c.dashboardKpiKey({key,preventDefault(){prevented=true}},'OUT');assert.equal(prevented,true);assert.equal(t.filter.value,'OUT');}const t=setup();t.c.dashboardKpiKey({key:'Tab',preventDefault(){throw Error('unexpected')}},'all');assert.deepEqual(t.calls,[]);
});
test('KPI actions remain keyboard accessible and disclose initial receipts',()=>{
 assert.equal((html.match(/class="hero-stat" role="button" tabindex="0"/g)||[]).length,3);
 assert.match(html,/Initial fund receipts are included here/);assert.match(html,/getElementById\('incomeOpeningNotice'\)\.hidden=filter!=='IN'/);
 assert.doesNotMatch(html,/#fab\s*\{display:none!important\}/);assert.match(html,/id="fab" type="button" aria-label="Open quick action"/);
 assert.match(html,/#teamHeaderBadgeText \{max-width:none;min-width:0\}/);assert.match(html,/id="appHeaderLogo"><img src="icons\/icon-96\.png"/);
});
