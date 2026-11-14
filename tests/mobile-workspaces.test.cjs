const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const phone=html.slice(html.indexOf('/* Phone workspaces:'),html.indexOf('/* Financial reports print on paper'));
function node(){return {style:{},attrs:{},classes:new Set(),classList:{add(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}}}
test('phone workspace layout reserves readable space without touching desktop or print',()=>{
 assert.match(phone,/@media screen and \(max-width: 599px\)/);
 for(const name of ['funds-page-head','project-page-head','contribution-page-head','transactions-page-head'])assert.ok(phone.includes(name));
 assert.match(phone,/#tab-funds \.fund-page-summary \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(phone,/#tab-dashboard \.hero-stats \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(phone,/#txList \.tx-row \{ display:flex; flex-direction:column/);
 assert.match(phone,/#pondoApp select, #pondoApp textarea \{ font-size:16px/);
});
test('secondary navigation exposes the current page and updates it when switching',()=>{
 const source=html.slice(html.indexOf('function syncMoreNavSelection(tab)'),html.indexOf('const pondoSwitchTab=switchTab;'));
 const buttons=[node(),node(),node()];const context={document:{querySelectorAll:()=>buttons}};vm.runInNewContext(source,context);
 context.syncMoreNavSelection('refunds');assert.equal(buttons[1].attrs['aria-current'],'page');assert.equal(buttons[0].attrs['aria-current'],undefined);
 context.syncMoreNavSelection('transactions');assert.equal(buttons[0].attrs['aria-current'],'page');assert.equal(buttons[1].attrs['aria-current'],undefined);
 assert.match(html,/class="nav-btn active" aria-current="page" data-tab="dashboard"/);
 assert.match(html,/if\(b\.dataset\.tab===tab\)b\.setAttribute\('aria-current','page'\);else b\.removeAttribute\('aria-current'\)/);
});
test('add-form selection is announced and has a legible selected state in both themes',()=>{
 const source=html.slice(html.indexOf('function fabShowForm(mode)'),html.indexOf('let fabPreviousFocus='));const elements={};for(const k of ['tx','fund','project']){elements['fabForm-'+k]=node();elements['fabTab-'+k]=node()}
 const context={document:{getElementById:id=>elements[id]}};vm.runInNewContext(source,context);context.fabShowForm('fund');
 assert.equal(elements['fabForm-fund'].style.display,'block');assert.equal(elements['fabForm-tx'].style.display,'none');assert.equal(elements['fabTab-fund'].attrs['aria-pressed'],'true');assert.equal(elements['fabTab-tx'].attrs['aria-pressed'],'false');
 assert.match(html,/#fabSheet \.fab-tabs-row button\.fab-tab\.active[\s\S]*?background:#4535c8 !important;[^}]*color:#fff !important/);
 assert.match(html,/id="fab" type="button" aria-label="Add a record"/);
});
