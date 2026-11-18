'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createActivityUI}=require('../faculty-fund-spark-activity-ui.js');
class Element{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.events={};this.textContent='';this.disabled=false;this.value='';}
 append(...els){this.children.push(...els);}
 replaceChildren(...els){this.children=els;}
 setAttribute(){}
 addEventListener(name,fn){this.events[name]=fn;}
 emit(name){this.events[name]?.({preventDefault(){},stopPropagation(){}});}
}
function fixture(makePager){const doc={createElement:t=>new Element(t,doc)},root=new Element('section',doc);let ctx={uid:'u',orgId:'o',role:'owner',memberConfirmed:true,scopeToken:1};const ui=createActivityUI({root,getContext:()=>ctx,makePager});ui.open();const form=root.children[2],status=root.children[3],results=root.children[4],load=root.children[5];const fields=form.children.filter(x=>x.tag==='label').map(x=>x.children[0]);fields[0].value='payments';fields[1].value='2025-01-01';fields[2].value='2025-01-02';return {root,ui,form,status,results,load,setContext:x=>ctx=x};}
const item={id:'p',kind:'payment',memberName:'<test>',amountCents:100,paymentDate:'2025-01-01',absenceDate:'2024-01-01',status:'active',remittanceId:null};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('history never shows a pending page after revision invalidation or scope reset',async()=>{
 let resolve;const f=fixture(()=>({reset(){},next:()=>new Promise(r=>resolve=r)}));f.form.emit('submit');f.ui.notifyRevision(5);resolve({revision:4,items:[item],hasMore:false});await tick();assert.equal(f.results.children.length,0);assert.match(f.status.textContent,/changed/);
 f.form.emit('submit');f.ui.reset();resolve({revision:5,items:[item],hasMore:false});await tick();assert.equal(f.root.children.length,0);assert.equal(f.root.hidden,true);
});
test('confirmed pages are displayed as text, then cleared on changed revision and failed follow-up',async()=>{
 let calls=0;const f=fixture(()=>({reset(){},next:async()=>{if(++calls===1)return {revision:4,items:[item],hasMore:true};throw Error('offline')}}));f.form.emit('submit');await tick();assert.equal(f.results.children.length,1);assert.match(f.results.children[0].children[0].textContent,/<test>/);assert.equal(f.load.disabled,false);f.load.emit('click');await tick();assert.equal(f.results.children.length,0);assert.match(f.status.textContent,/Could not confirm/);
 calls=0;f.form.emit('submit');await tick();f.ui.notifyRevision(5);assert.equal(f.results.children.length,0);assert.match(f.status.textContent,/changed/);
});
test('an account change during a page clears old results',async()=>{
 let resolve,calls=0;const f=fixture(()=>({reset(){},next:()=>++calls===1?Promise.resolve({revision:1,items:[item],hasMore:true}):new Promise(r=>resolve=r)}));f.form.emit('submit');await tick();f.load.emit('click');f.setContext({uid:'other',orgId:'o',role:'owner',memberConfirmed:true,scopeToken:1});resolve({revision:1,items:[item],hasMore:false});await tick();assert.equal(f.results.children.length,0);assert.match(f.status.textContent,/Workspace changed/);
});
