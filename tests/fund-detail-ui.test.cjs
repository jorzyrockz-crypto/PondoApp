const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const ui=html.slice(html.indexOf('function openFundDetails('),html.indexOf('function openProjectDetails('));
const css=html.slice(html.indexOf('/* Project detail workspace:'),html.indexOf('/* Financial reports print on paper'));
test('fund detail shares responsive, themed modal styles without changing other dialogs',()=>{
 assert.match(html,/detailDialog\.classList\.toggle\('fund-detail',kind==='Fund source'\)/);
 assert.match(css,/\:is\(\.project-detail,\.fund-detail\) \.project-overview/);
 assert.match(css,/body\.dark-mode \.fund-detail/);assert.match(css,/@media \(max-width:700px\)/);assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/body\.role-reviewer \:is\(\.project-detail,\.fund-detail\) \.project-quick-actions/);
});
test('overview and allocations use actual cash and reserve calculations',()=>{
 for(const v of ['fmt(received/100)','fmt(spent/100)','fmt(fundCash(id)/100)','fmt(fundAvailable(id)/100)','fmt(fundReserved(id)/100)','fmt(f.initialAmount)','fmt(a.amount)','projectSpent(id,a.projectId)','allocationRemaining(id,a.projectId)','The cash balance includes reserved amounts','Initial fund receipts are shown separately','escapeText(p?.name'])assert.ok(ui.includes(v),v);
});
test('uncommitted balance excludes unspent project allocations without clamping',()=>{
 const code=html.slice(html.indexOf('function fundCash('),html.indexOf('function payablePaid('));
 const c=vm.createContext({funds:[{id:'f',initialAmount:52000}],txs:[{fundId:'f',type:'IN',amount:8000},{fundId:'f',projectId:'p',type:'OUT',amount:10000},{fundId:'f',type:'OUT',amount:600}],allocations:[{fundId:'f',projectId:'p',amount:20000}],cents:n=>Math.round(n*100)});vm.runInContext(code,c);
 assert.equal(c.fundCash('f'),4940000);assert.equal(c.fundReserved('f'),1000000);assert.equal(c.fundAvailable('f'),3940000);
 c.funds[0].initialAmount=0;assert.ok(c.fundAvailable('f')<0);
});
test('existing sections, color, edit, transaction and return handlers remain connected',()=>{
 for(const v of ['data-section="receipt"','data-section="allocations"','data-section="transactions"','data-section="settings"','detailTransactions(items,false)','fundCardColor','CARD_COLORS[e.target.value]','fund-edit-btn','validateActualDate(dateRaw','parseMoney(amtRaw)','fund-tx-btn',"openFundChild(id,()=>{openFabSheet('tx')",'fabTxFund','syncTxProjectChoices()','states[x.dataset.section]=x.open','No projects have allocations'])assert.ok(ui.includes(v),v);
});
