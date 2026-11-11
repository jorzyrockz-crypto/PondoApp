const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function element(id='') {return {id,hidden:false,inert:false,style:{},children:[],textContent:'',setAttribute(){},appendChild(x){this.children.push(x)},remove(){},focus(){},querySelector(){return element()}};}
async function runGuard(saved){
 const names=[],snapshots=[],nodes={authGate:element('authGate'),pondoApp:element('pondoApp')};
 const document={body:{children:Object.values(nodes),appendChild(){}},createElement:()=>element()};
 const ctx=vm.createContext({window:{pondoGuestMode:true,addEventListener(){}},document,navigator:{locks:{request:(_name,_options,fn)=>fn({})}},
  TransactionalFundStore:{open:async name=>{names.push(name);return {load:async()=>({revision:saved?2:0,snapshot:saved}),save:async()=>{throw Error('unexpected initialization write')}}}},
  applySnapshot:x=>snapshots.push(x),blankWorkspaceSnapshot:()=>({guestBlank:true}),renderAll(){},syncSettingsUI(){},applyAppearance(){},applyAppShortcut(){},
  funds:[],txs:[],projects:[],contributionActivities:[],setTimeout,location:{reload(){}}});
 const start=html.indexOf('window.trackerReady=false;'),end=html.indexOf('// Kept outside the Firebase module',start);
 vm.runInContext(html.slice(start,end),ctx);ctx.window.startTabGuard();await new Promise(r=>setImmediate(r));
 return {names,snapshots,ctx};
}
test('offline starts an isolated blank tracker instead of opening signed-in storage',async()=>{
 const t=await runGuard(null);assert.deepEqual(t.names,['fund-tracker-offline-guest-v1']);assert.equal(t.snapshots[0].guestBlank,true);assert.equal(t.ctx.window.trackerReady,true);
});
test('offline reopens only the separate guest snapshot',async()=>{
 const snapshot={guest:'previous offline data'},t=await runGuard(snapshot);assert.deepEqual(t.names,['fund-tracker-offline-guest-v1']);assert.equal(t.snapshots[0],snapshot);
});
test('offline control is independent of Firebase and clearly describes limitations',()=>{
 assert.match(html,/id="authOfflineBtn"/);assert.match(html,/not your signed-in personal or team workspaces/);
 assert.ok(html.indexOf("getElementById('authOfflineBtn').addEventListener")<html.indexOf('import { initializeApp }'));
 assert.match(html,/if\(window\.pondoGuestMode\)return;/);
 assert.match(html,/Clear All Data is unavailable in offline mode/);
 assert.match(html,/if\(trackerPending\)await trackerQueue/);
 assert.match(html,/window\.pondoGuestMode\?'offline-guest'/);
});
