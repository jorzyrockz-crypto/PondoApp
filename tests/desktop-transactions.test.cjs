const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Desktop transaction ledger:'),html.indexOf('/* Financial reports print on paper'));
const code=html.slice(html.indexOf("  let q=(document.getElementById('txSearch')"),html.indexOf('  renderAudit();',html.indexOf("  let q=(document.getElementById('txSearch')")));
function render(q='',filter='all'){
 const nodes={txSearch:{value:q},txTypeFilter:{value:filter},transactionResultCount:{textContent:''}};
 function element(tag){return {tag,children:[],attributes:{},innerHTML:'',className:'',isConnected:false,appendChild(x){this.children.push(x);return x},append(...xs){this.children.push(...xs)},contains(x){return this.children.includes(x)},querySelector(){return null},setAttribute(k,v){this.attributes[k]=v}}}
 const list=element('div');nodes.txList=list;
 const data=[{id:'a',date:'2026-04-02',type:'IN',fundId:'fund',description:'Grant <b>',category:'Grant',payee:'District Office',amount:80},{id:'b',date:'2026-05-05',type:'OUT',fundId:'fund',projectId:'project',description:'Classroom supplies',category:'Supplies',payee:'School Supply Depot',receiptNo:'R-123',method:'Cash',notes:'<script>bad</script>',receiptImage:'receipt-data',amount:25}];
 let voided=null;const context={txs:data,funds:[{id:'fund',name:'School fund'}],projects:[{id:'project',name:'Classroom'}],contributionPayments:[],document:{getElementById:id=>nodes[id],createElement:element},escapeText:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),createdByBadge:()=>'',fmt:n=>'₱'+n,LICON:()=>'<svg></svg>',addReceiptLink:(el,data)=>{if(data){let a=element('a');a.className='receipt-link';el.appendChild(a)}},voidTransaction:id=>voided=id};
 vm.runInNewContext(code,context);return {list,count:nodes.transactionResultCount.textContent,voided:()=>voided};
}
test('desktop ledger layout is limited to wide non-coarse pointers and retains touch metadata',()=>{
 assert.match(css,/@media screen and \(min-width:1200px\) and \(not \(pointer:coarse\)\)/);
 assert.match(css,/\.transactions-ledger-heading,\.transactions-column-head,\.tx-kind,\.tx-desktop-details,\.tx-desktop-extra,\.transactions-audit-intro \{ display:none; \}/);
 assert.match(css,/#txList \.tx-meta \{ display:none; \}/);
 assert.match(css,/body\.dark-mode #tab-transactions \.transactions-ledger-heading/);
 assert.match(html,/class="transactions-ledger-heading"[\s\S]*?id="transactionResultCount" aria-live="polite"/);
});
test('the visible count and existing search and type filters reflect the rendered transactions',()=>{
 let all=render();assert.equal(all.count,'2 of 2 transactions');assert.equal(all.list.children.length,2);
 assert.match(all.list.children[0].innerHTML,/Classroom supplies/);assert.match(all.list.children[1].innerHTML,/Grant &lt;b&gt;/);
 let found=render('depot','OUT');assert.equal(found.count,'1 of 2 transactions');assert.equal(found.list.children.length,1);
 let none=render('depot','IN');assert.equal(none.count,'0 of 2 transactions');assert.equal(none.list.children.length,0);
});
test('desktop details are escaped and existing receipt and void controls remain attached',()=>{
 let {list,voided}=render();let entry=list.children[0];
 assert.match(entry.innerHTML,/tx-desktop-details/);assert.match(entry.innerHTML,/School fund/);assert.match(entry.innerHTML,/Classroom/);
 assert.match(entry.innerHTML,/R-123/);assert.match(entry.innerHTML,/&lt;script&gt;bad&lt;\/script&gt;/);assert.match(entry.innerHTML,/−₱25/);
 let controls=entry.children[0],receipt=controls.children.find(x=>x.className==='receipt-link'),button=controls.children.find(x=>x.textContent==='Void');
 assert.ok(receipt);assert.equal(button.attributes['aria-label'],'Void transaction: Classroom supplies');button.onclick();assert.equal(voided(),'b');
});
