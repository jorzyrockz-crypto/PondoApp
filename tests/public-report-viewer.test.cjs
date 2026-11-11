const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync('public-report/viewer.js','utf8').replace(/^import .*;\n/gm,'');
class Element{constructor(tag){this.tag=tag;this.textContent='';this.children=[];this.className=''}append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=nodes}}
function setup(query='?id=abcdefghijklmnopqrstuvwxyz123456&view=funds'){
 const status=new Element('p'),target=new Element('div');let next,fail,reads=[],events={};const navigator={onLine:true};
 const document={getElementById:id=>id==='status'?status:target,createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment')};
 const ctx=vm.createContext({document,navigator,window:{addEventListener:(name,fn)=>events[name]=fn},location:{search:query},URLSearchParams,Intl,Date,Number,initializeApp:x=>x,getFirestore:()=>({}),doc:(_,collection,id)=>{reads.push([collection,id]);return{}},onSnapshot:(_,options,n,f)=>{assert.equal(options.includeMetadataChanges,true);next=n;fail=f}});
 vm.runInContext(src,ctx);return {status,target,reads,navigator,events,next:val=>next(val),fail:()=>fail()};
}
function text(node){return [node.textContent,...node.children.map(text)].join(' ')}
test('reads only the public report and renders generic text',()=>{
 let t=setup();assert.equal(t.reads[0][0],'publicReports');
 t.next({exists:()=>true,data:()=>({currency:'PHP',report:{version:1,funds:[{label:'Alice secret',receivedCents:1000,spentCents:100,balanceCents:900,transactions:[{date:'2026-01-01',direction:'OUT',amountCents:100,label:'secret',notes:'Alice'}]}]},updatedAt:{toDate:()=>new Date('2026-01-01T00:00:00Z')}})});
 assert.match(text(t.target),/Fund 1/);assert.match(text(t.target),/Fund expense/);assert.doesNotMatch(text(t.target),/Alice|secret/);
});
test('revocation or read error clears previously visible data',()=>{
 let t=setup();t.next({exists:()=>true,data:()=>({currency:'PHP',report:{version:1,funds:[]}})});t.next({exists:()=>false});assert.equal(t.target.children.length,0);assert.match(t.status.textContent,/no longer shared/);
});
test('invalid ids do not request a report',()=>{let t=setup('?id=../../private');assert.equal(t.reads.length,0);assert.match(t.status.textContent,/invalid/)});
test('unselected and unsupported views do not display records',()=>{let t=setup('?id=abcdefghijklmnopqrstuvwxyz123456&view=projects');t.next({exists:()=>true,data:()=>({currency:'PHP',report:{version:1,funds:[]}})});assert.match(t.status.textContent,/not published/);assert.equal(t.target.children.length,0)});

test('cached and offline reports disclose that data may be stale or revoked',()=>{
 let t=setup(),data={currency:'PHP',report:{version:1,funds:[]},updatedAt:{toDate:()=>new Date('2026-01-01T00:00:00Z')}};
 t.next({exists:()=>true,data:()=>data,metadata:{fromCache:true}});
 assert.match(t.status.textContent,/cached copy/);assert.match(t.status.textContent,/revoked/);
 t.next({exists:()=>true,data:()=>data,metadata:{fromCache:false}});
 assert.doesNotMatch(t.status.textContent,/cached copy/);assert.match(t.status.textContent,/Last updated/);
 t.navigator.onLine=false;t.events.offline();assert.match(t.status.textContent,/Offline/);assert.match(t.status.textContent,/revoked/);
 t.navigator.onLine=true;t.events.online();assert.doesNotMatch(t.status.textContent,/Offline/);
});
