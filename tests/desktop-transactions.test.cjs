const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Desktop transaction ledger:'),html.indexOf('/* Financial reports print on paper'));
const code=html.slice(html.indexOf('  visibleRows.forEach(row=>'),html.indexOf(" if(!list.children.length)",html.indexOf('  visibleRows.forEach(row=>')));
function render(q='',filter='all'){
 const nodes={txSearch:{value:q},txTypeFilter:{value:filter},transactionResultCount:{textContent:''}};
 function element(tag){return {tag,children:[],dataset:{},attributes:{},innerHTML:'',className:'',isConnected:false,appendChild(x){this.children.push(x);return x},append(...xs){this.children.push(...xs)},contains(x){return this.children.includes(x)},querySelector(){return null},setAttribute(k,v){this.attributes[k]=v}}}
 const list=element('div');nodes.txList=list;
 const data=[{id:'a',date:'2026-04-02',type:'IN',fundId:'fund',description:'Grant <b>',category:'Grant',payee:'District Office',amount:80},{id:'b',date:'2026-05-05',type:'OUT',fundId:'fund',projectId:'project',description:'Classroom supplies',category:'Supplies',payee:'School Supply Depot',receiptNo:'R-123',method:'Cash',notes:'<script>bad</script>',receiptImage:'receipt-data',amount:25}];
 const ledger=require('../unified-ledger.js');const all=ledger.build({funds:[{id:'fund',name:'School fund'}],projects:[{id:'project',name:'Classroom'}],transactions:data});const visibleRows=all.filter(r=>ledger.matches(r,{query:q,type:filter}));let voided=null;const context={visibleRows,txList:list,unifiedLedgerIcon:row=>({kind:row.impact==='IN'?'income':'expense',svg:'<svg></svg>'}),addUnifiedDetails:()=>{},addUnifiedWorkflowAction:()=>{},transactionTypeMatches:(t,filter)=>filter==='all'||t.type===filter,transactionKind:t=>t.type==='OUT'?'Expense':'Income',renderPersonalDeathTransactions:()=>{},incomeDetailsEligible:t=>t.type==='IN',openIncomeEdit:()=>{},txs:data,funds:[{id:'fund',name:'School fund'}],projects:[{id:'project',name:'Classroom'}],contributionPayments:[],document:{getElementById:id=>nodes[id],createElement:element},escapeText:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),createdByBadge:()=>'',fmt:n=>'₱'+n,LICON:()=>'<svg></svg>',addReceiptLink:(el,data)=>{if(data){let a=element('a');a.className='receipt-link';el.appendChild(a)}},voidTransaction:id=>voided=id};
 vm.runInNewContext(code,context);return {list,count:visibleRows.length+' of '+all.length+' entries',voided:()=>voided};
}
test('desktop ledger layout is limited to wide non-coarse pointers and retains touch metadata',()=>{
 assert.match(css,/@media screen and \(min-width:1200px\) and \(not \(pointer:coarse\)\)/);
 assert.match(css,/\.transactions-ledger-heading,\.transactions-column-head,\.tx-kind,\.tx-desktop-details,\.tx-desktop-extra,\.transactions-audit-intro \{ display:none; \}/);
 assert.match(css,/#txList \.tx-meta \{ display:none; \}/);
 assert.match(css,/body\.dark-mode #tab-transactions \.transactions-ledger-heading/);
 assert.match(html,/class="transactions-ledger-heading"[\s\S]*?id="transactionResultCount" aria-live="polite"/);
});
test('the visible count and existing search and type filters reflect the rendered transactions',()=>{
 let all=render();assert.equal(all.count,'2 of 2 entries');assert.equal(all.list.children.length,2);
 assert.match(all.list.children[0].innerHTML,/Classroom supplies/);assert.match(all.list.children[1].innerHTML,/Grant &lt;b&gt;/);
 let found=render('depot','OUT');assert.equal(found.count,'1 of 2 entries');assert.equal(found.list.children.length,1);
 let none=render('depot','IN');assert.equal(none.count,'0 of 2 entries');assert.equal(none.list.children.length,0);
});
test('desktop rows retain essential context and actions while moving details to the modal',()=>{
 let {list,voided}=render();let entry=list.children[0];
 assert.match(entry.innerHTML,/tx-desktop-details/);assert.match(entry.innerHTML,/School fund/);assert.doesNotMatch(entry.innerHTML,/R-123|bad&lt;\/script&gt;|Paid to \/ from/);assert.match(entry.innerHTML,/−₱25/);
 let controls=entry.children[0],button=controls.children.find(x=>x.textContent==='Void');
 assert.equal(button.attributes['aria-label'],'Void transaction: Classroom supplies');button.onclick();assert.equal(voided(),'b');
});

test('transaction titles open a single record modal instead of expandable rows',()=>{
 const src=html.slice(html.indexOf('function ledgerDetailContext()'),html.indexOf('function renderUnifiedRecent('));assert.match(src,/function openUnifiedLedgerDetail\(key\)/);assert.match(src,/unifiedLedgerRows\(\)\.find\(item=>item\.key===key\)/);assert.match(src,/dt\.textContent=name;dd\.textContent=String\(value\)/);assert.match(src,/addReceiptLink\(attachments,row\.receipt\)/);assert.match(src,/appendRefundItems\(attachments,row\.itemsJSON\)/);assert.match(src,/appendSharedMemberReceipt\(attachments/);assert.doesNotMatch(src,/createElement\('details'\)|addUnifiedDetails/);assert.match(html,/#txList>\.tx-entry:nth-child\(even\)/);assert.match(html,/body\.dark-mode #tab-transactions #txList>\.tx-entry:nth-child\(even\)/);
});


test('transaction filters share a panel and contextual warnings remain',()=>{
 const view=html.slice(html.indexOf('<!-- TRANSACTIONS -->'),html.indexOf('<!-- REFUND HISTORY -->'));
 assert.match(view,/class="transaction-filters-panel"[\s\S]*?id="txSearch"[\s\S]*?id="txTypeFilter"[\s\S]*?id="ledgerImpact"[\s\S]*?id="ledgerFund"[\s\S]*?id="ledgerFrom"[\s\S]*?id="ledgerTo"[\s\S]*?<\/section>/);assert.doesNotMatch(view,/id="ledgerTotals"/);assert.match(html,/Workspace data is not yet confirmed/);assert.match(html,/Member refund history may be unavailable or incomplete/);assert.match(html,/#detailDialog\.ledger-detail \.ledger-modal-fields>div\{border:0/);
});
