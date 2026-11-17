const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const a=html.indexOf('/* Mobile contribution activity:'),b=html.indexOf('/* Dashboard cards only:',a);assert.ok(a>=0&&b>a);const css=html.slice(a,b);
const ui=html.slice(html.indexOf('function openContributionDetails('),html.indexOf('function openContributionForm(',html.indexOf('function openContributionDetails(')));
test('contribution activity uses a mobile sheet and three-zone contributor cards without changing desktop',()=>{
 assert.match(css,/@media screen and \(max-width:767px\)/);assert.match(css,/height:92dvh;max-height:92dvh/);assert.match(css,/grid-template-areas:'name name status' 'expected paid balance' 'action action action'/);assert.match(css,/contrib-person-status::before \{content:none\}/);assert.match(css,/contrib-number:nth-child\(4\).*font-weight:800/);
 assert.match(css,/contrib-desktop-history \{display:none!important\}/);assert.match(css,/contrib-mobile-history \{display:inline-flex/);assert.match(css,/contrib-mobile-history, \.contribution-detail \.contrib-mobile-disabled, \.contribution-detail \.contrib-status-mobile-text \{display:none\}/);
});
test('mobile filters are docked below the heading, outside the scrolling body',()=>{
 assert.match(html,/<div id="detailFilterDock" class="detail-filter-dock" hidden><\/div><div id="detailBody"/);assert.match(html,/if\(mobile\)dock\.appendChild\(filter\);else target\.after\(filter\)/);assert.match(css,/detail-filter-dock \{flex:0 0 auto/);assert.match(css,/contrib-filter select\.input/);assert.match(css,/body\.dark-mode \.contribution-detail \.detail-filter-dock/);
});
test('history triggers share expanded state and unavailable payment actions stay disabled',()=>{
 assert.match(ui,/class="contrib-history-toggle contrib-mobile-history"/);assert.match(ui,/class="contrib-history-toggle contrib-desktop-history"/);assert.match(ui,/group\.querySelectorAll\('\.contrib-history-toggle'\)\.forEach\(b=>b\.setAttribute\('aria-expanded',String\(details\.open\)\)\)/);
 assert.match(ui,/contrib-mobile-disabled\" disabled/);assert.match(ui,/a\.archived\?'Activity archived':'Contributor fully paid'/);assert.match(css,/contrib-pay:disabled \{opacity:/);
});

test('filter docking moves one control set and preserves focused text across viewport changes',()=>{
 const vm=require('node:vm'),start=html.indexOf('function positionContributionFilters()'),end=html.indexOf('const contributionFilterMedia=',start);assert.ok(start>=0&&end>start);
 const input={tagName:'INPUT',selectionStart:1,selectionEnd:3,focus(){ctx.document.activeElement=this},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b}};
 const heading={after(node){node.parentElement=list;node.previousElementSibling=this;dock.child=null}},list={},dock={hidden:true,child:null,appendChild(node){this.child=node;node.parentElement=this;node.previousElementSibling=null}},filter={parentElement:list,previousElementSibling:heading,contains:node=>node===input};
 const ctx={detailOverlay:{hidden:false},detailDialog:{classList:{contains:()=>true},querySelector:()=>filter},window:{matchMedia:()=>({matches:ctx.mobile})},document:{activeElement:input,getElementById:()=>dock,querySelector:()=>heading},mobile:true};vm.runInNewContext(html.slice(start,end),ctx);
 ctx.positionContributionFilters();assert.equal(dock.hidden,false);assert.equal(dock.child,filter);assert.equal(ctx.document.activeElement,input);assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,3);
 ctx.mobile=false;ctx.positionContributionFilters();assert.equal(dock.hidden,true);assert.equal(filter.previousElementSibling,heading);assert.equal(filter.parentElement,list);assert.equal(ctx.document.activeElement,input);
 ctx.mobile=true;ctx.positionContributionFilters();assert.equal(dock.child,filter);assert.equal(ctx.document.activeElement,input);
});
