const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function toggleBulkNamesSize()'),end=html.indexOf('function openContributionBatch(',start);assert.ok(start>=0&&end>start);
function setup(){
 const names={value:'Jimmy\nArjey',style:{height:'280px'},classList:{on:false,toggle(name,on){assert.equal(name,'bulk-names-expanded');this.on=on}}};
 const button={attrs:{'aria-expanded':'false'},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v},textContent:'Expand names field'};
 const ctx={document:{getElementById:id=>({cBulkNames:names,cBulkExpand:button}[id])}};vm.runInNewContext(html.slice(start,end),ctx);return {ctx,names,button};
}
test('bulk names field expands and reduces without losing entered names',()=>{
 const {ctx,names,button}=setup();ctx.toggleBulkNamesSize();assert.equal(button.attrs['aria-expanded'],'true');assert.equal(button.textContent,'Reduce names field');assert.equal(names.classList.on,true);assert.equal(names.style.height,'');assert.equal(names.value,'Jimmy\nArjey');
 ctx.toggleBulkNamesSize();assert.equal(button.attrs['aria-expanded'],'false');assert.equal(button.textContent,'Expand names field');assert.equal(names.classList.on,false);assert.equal(names.value,'Jimmy\nArjey');
});
test('bulk form has a labeled resizable field and accessible non-submit control',()=>{
 assert.match(html,/<label>Names, one per line<textarea id="cBulkNames" class="input" rows="7"/);
 assert.match(html,/id="cBulkExpand"[^>]*aria-controls="cBulkNames" aria-expanded="false" onclick="toggleBulkNamesSize\(\)"/);
 assert.match(html,/#cBulkNames \{min-height:160px!important;max-height:70dvh;resize:vertical/);
 assert.match(html,/\.input:where\(:not\(#cBulkNames\)\)/);assert.match(html,/textarea:where\(:not\(#cBulkNames\)\)/);
 assert.match(html,/names\.length>500/);assert.match(html,/Skipped .*duplicate name/);
});
