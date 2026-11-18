'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSparkReader}=require('../faculty-fund-spark-read.js');
const metadata={fromCache:false,hasPendingWrites:false};
function fixture(){
 let revision=1, queries=0, active=0, maxActive=0, mode='normal', current=true;
 const snap=value=>({metadata,exists:()=>value!==null,data:()=>value});
 const api={doc:(_db,p)=>p,collection:(_db,p)=>p,query:p=>p,limit:n=>n,
  getDocFromServer:async path=>path.includes('Revision')?snap({revision}):snap(null),
  getDocsFromServer:async()=>{queries++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setImmediate(r));active--;if(mode==='race')revision=2;if(mode==='scope')current=false;return {metadata,size:0,docs:[]};}};
 const reader=createSparkReader({db:{},api,orgId:'school',isCurrent:()=>current,project:()=>({}),trackRemittanceReleases:true});
 return {reader,setMode:x=>mode=x,stats:()=>({queries,maxActive})};
}
test('independent confirmed collection reads run concurrently',async()=>{const f=fixture();const r=await f.reader.read();assert.equal(r.revision,1);assert.equal(f.stats().queries,12);assert.ok(f.stats().maxActive>1);});
test('parallel reads still reject revision races and workspace changes',async()=>{for(const mode of ['race','scope']){const f=fixture();f.setMode(mode);await assert.rejects(f.reader.read(),mode==='race'?/changed while loading/:/Workspace changed/);}});
const fs=require('node:fs'),vm=require('node:vm');
function liveScheduler(){
 const ui=fs.readFileSync('faculty-fund-ui.js','utf8');const code=ui.slice(ui.indexOf(' let liveTimer=null'),ui.indexOf(' function close(){'));
 const tasks=new Map();let next=1,reads=0,resolve;const ctx={opened:true,busy:false,setTimeout:f=>{const id=next++;tasks.set(id,f);return id},clearTimeout:id=>tasks.delete(id),read:()=>{reads++;return new Promise(r=>resolve=r)}};
 vm.runInNewContext(code+'\nthis.schedule=scheduleLiveRefresh;this.cancel=cancelLiveRefresh;',ctx);
 return {ctx,tasks,reads:()=>reads,resolve:()=>resolve(),flush:async()=>{const [id,fn]=tasks.entries().next().value;tasks.delete(id);return fn();}};
}
test('live refreshes are coalesced, serialized, and cancelled when closed',async()=>{
 const s=liveScheduler();s.ctx.schedule();s.ctx.schedule();assert.equal(s.tasks.size,1);const first=s.flush();assert.equal(s.reads(),1);s.ctx.schedule();s.ctx.schedule();assert.equal(s.tasks.size,0);s.resolve();await first;assert.equal(s.tasks.size,1);const second=s.flush();assert.equal(s.reads(),2);s.ctx.cancel();s.ctx.opened=false;s.resolve();await second;assert.equal(s.tasks.size,0);s.ctx.schedule();assert.equal(s.tasks.size,0);
});
test('live refresh waits while a financial mutation is in progress',async()=>{
 const s=liveScheduler();s.ctx.busy=true;s.ctx.schedule();assert.equal(s.tasks.size,0);s.ctx.busy=false;s.ctx.schedule();assert.equal(s.tasks.size,1);const p=s.flush();s.resolve();await p;
});
