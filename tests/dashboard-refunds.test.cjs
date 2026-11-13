const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('function dashboardOutstandingRefunds('),html.indexOf('// Team review queue:'));
class Element {
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.attributes={};const set=new Set();this.classList={remove:name=>set.delete(name),toggle:(name,on)=>on?set.add(name):set.delete(name),contains:name=>set.has(name)};}
 setAttribute(key,value){this.attributes[key]=value}
 replaceChildren(...nodes){this.children=nodes}
 append(...nodes){this.children.push(...nodes)}
 appendChild(node){this.children.push(node)}
}
function setup(){
 const ids={};for(const id of ['dashboardRefundCard','dashboardRefundCount','dashboardRefundEmpty','dashboardRefundStatus','dashboardRefundList'])ids[id]=new Element();
 const state={orgId:null};const c=vm.createContext({window:{pondoTeamState:state},navigator:{onLine:true},document:{getElementById:id=>ids[id],createElement:()=>new Element()},payables:[],txs:[],fmt:n=>'₱'+n,
 payablePaid(id){return c.txs.filter(t=>t.type==='OUT'&&t.payableId===id).reduce((n,t)=>n+Math.round(t.amount*100),0)},
 payableOutstanding(p){return Math.max(0,Math.round(p.amount*100)-c.payablePaid(p.id))}});
 vm.runInContext(code,c);return {c,state,ids};
}
test('refund summary counts only outstanding refunds and accurately distinguishes payment and approval statuses',()=>{
 const {c,ids}=setup();c.payables.push(
 {id:'p',kind:'advance',description:'<img onerror=alert(1)>',amount:100,pendingApproval:{}},
 {id:'u',kind:'advance',description:'Unpaid',amount:200},
 {id:'a',kind:'advance',description:'Partial',amount:2400},
 {id:'f',kind:'advance',amount:10}, {id:'other',kind:'invoice',amount:10});
 c.txs.push({type:'OUT',payableId:'a',amount:1500},{type:'IN',payableId:'u',amount:200},{type:'OUT',payableId:'f',amount:10});
 c.renderDashboardRefunds();assert.equal(ids.dashboardRefundCount.textContent,'3');assert.equal(ids.dashboardRefundEmpty.hidden,true);assert.equal(ids.dashboardRefundCard.classList.contains('has-outstanding'),true);
 const rows=ids.dashboardRefundList.children;assert.equal(rows[0].children[0].textContent,'<img onerror=alert(1)>');assert.match(rows[0].children[1].textContent,/Pending approval · Outstanding ₱100/);assert.match(rows[1].children[1].textContent,/Awaiting payment · Outstanding ₱200/);assert.match(rows[2].children[1].textContent,/Partially paid · Outstanding ₱900/);
});
test('empty, unconfirmed and stale states do not confuse stale or previous workspace data with confirmed empty results',()=>{
 const {c,ids,state}=setup();c.renderDashboardRefunds();assert.equal(ids.dashboardRefundEmpty.hidden,false);assert.equal(ids.dashboardRefundCard.classList.contains('has-outstanding'),false);
 c.payables.push({id:'x',kind:'advance',amount:10});Object.assign(state,{orgId:'team',memberConfirmed:false,baselineReady:false});c.renderDashboardRefunds();assert.equal(ids.dashboardRefundList.children.length,0);assert.equal(ids.dashboardRefundCount.hidden,true);assert.equal(ids.dashboardRefundEmpty.hidden,true);assert.equal(ids.dashboardRefundCard.classList.contains('has-outstanding'),false);
 state.memberConfirmed=true;state.baselineReady=true;state.online=true;c.renderDashboardRefunds();assert.equal(ids.dashboardRefundList.children.length,1);assert.equal(ids.dashboardRefundStatus.hidden,true);assert.equal(ids.dashboardRefundCard.classList.contains('has-outstanding'),true);
 for(const flag of ['dirty','syncError','listenerError','recoveryLocked','pushTimer','pushesInFlight']){state[flag]=true;c.renderDashboardRefunds();assert.equal(ids.dashboardRefundStatus.hidden,false);state[flag]=false}
 c.payables.length=0;state.online=false;c.renderDashboardRefunds();assert.equal(ids.dashboardRefundEmpty.hidden,true);assert.match(ids.dashboardRefundStatus.textContent,/out of date/);assert.equal(ids.dashboardRefundCard.classList.contains('has-outstanding'),false);
});
test('dashboard has ordered right rail and retains the existing review queue and responsive layout',()=>{
 const dash=html.slice(html.indexOf('<!-- DASHBOARD -->'),html.indexOf('<!-- FUNDS -->'));
 assert.ok(dash.indexOf('dashboardActionsCard')<dash.indexOf('dashboard-side-column'));
 assert.ok(dash.indexOf('dashboardRefundTitle')<dash.indexOf('Refund Transactions'));
 assert.ok(dash.indexOf('Refund Transactions')<dash.indexOf('Recent Transactions'));
 assert.match(dash,/onclick="switchTab\('refunds'\)"/);
 assert.match(html,/@media screen and \(min-width:1200px\).*?[\s\S]*?\.dashboard-desktop-grid\{display:grid/);
 assert.match(html,/function renderDashboardActions\(\) \{\s*if \(window\.renderDashboardRefunds\)/);
});
test('amber styling is available in both modes for outstanding requests',()=>{
 assert.match(html,/\.dashboard-refund-alert\.has-outstanding\{background:#fff8ed;border-color:#f3c888\}/);
 assert.match(html,/body\.dark-mode \.dashboard-refund-alert\.has-outstanding\{background:#302819;border-color:#78542c/);
});
