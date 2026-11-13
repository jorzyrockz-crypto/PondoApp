const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const markup=html.slice(html.indexOf('<div id="fabSheet"'),html.indexOf('<button class="fab no-print"'));
test('add sheet keeps labeled fields, all record actions and an accessible dialog',()=>{
 assert.match(markup,/aria-labelledby="fabSheetTitle"/);assert.match(markup,/aria-label="Close add record"/);assert.match(markup,/openRefundRequest\(\)/);
 for(const id of ['fabTxDesc','fabTxAmt','fabTxDate','fabTxType','fabTxFund','fabTxProject','fabTxCategory','fabTxPayee','fabTxReceipt','fabTxMethod','fabTxNotes','fabFundName','fabFundAmt','fabFundDate','fabFundPurpose','fabFundColor','fabProjectName','fabProjectSeries','fabProjectCycle','fabProjectDescription','fabProjectBudget','fabProjectStatus'])assert.match(markup,new RegExp('<label[^>]*>[^<]*(?:<span[^>]*>[^<]*</span>)?<(?:input|select) id="'+id+'"'),id);
 assert.match(markup,/for="fabTxImage"/);assert.match(markup,/id="fabTxImage"/);
 for(const handler of ['fabSaveTx()','fabSaveFund()','fabSaveProject()'])assert.ok(markup.includes('onclick="'+handler+'"'));
 assert.match(markup,/class="fab-sheet-body"[\s\S]*<footer class="fab-footer">/);
});
test('switching record types updates both active choice and persistent save action',()=>{
 const source=html.slice(html.indexOf('function fabShowForm(mode)'),html.indexOf('let fabPreviousFocus='));let els={};for(const m of ['tx','fund','project']){els['fabForm-'+m]={style:{}};els['fabSave-'+m]={style:{}};els['fabTab-'+m]={attrs:{},classList:{add(){},toggle(k,v){this.active=v}},setAttribute(k,v){this.attrs[k]=v}}}let body={scrollTop:99};let ctx={document:{getElementById:id=>els[id],querySelector:()=>body}};vm.runInNewContext(source,ctx);ctx.fabShowForm('project');assert.equal(els['fabSave-project'].style.display,'inline-flex');assert.equal(els['fabSave-tx'].style.display,'none');assert.equal(els['fabForm-project'].style.display,'block');assert.equal(els['fabTab-project'].attrs['aria-pressed'],'true');assert.equal(body.scrollTop,0);
});
test('sheet adapts to narrow screens and has dark theme styling',()=>{assert.match(html,/#fabSheet \.fab-footer \{ display:flex; flex:none/);assert.match(html,/#fabSheet \.fab-sheet-body \{ padding:/);assert.match(html,/@media \(max-width:480px\)[\s\S]*?#fabSheet \.fab-fields \{ grid-template-columns:minmax\(0,1fr\)/);assert.match(html,/body\.dark-mode #pondoApp #fabSheet \.fab-field \.input/);assert.match(html,/#fabSheet button:focus-visible/)});
