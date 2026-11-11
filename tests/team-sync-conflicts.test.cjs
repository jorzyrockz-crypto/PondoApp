const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.slice(html.indexOf('function stableSnapshotJSON('), html.indexOf('window.pondoCloudSync ='));
function setup(server) {
  const db = { data: server, writes: 0 };
  const storage = new Map(), notices = [];
  const state = { orgId:'org', uid:'user', role:'owner', baselineReady:true, dirty:false, recoveryLocked:false, syncError:false, pushesInFlight:0, pendingSnapshot:null, pushTimer:null, lastSyncedJSON:null, lastSyncedRevision: server && server._syncRevision || 0 };
  const ctx = vm.createContext({ pondoTeamState:state, window:{}, navigator:{onLine:true}, CLIENT_ID:'client', firestoreDb:{},
    canWriteOrgData:()=>true, stripHeavyFields:x=>JSON.parse(JSON.stringify(x)), setSyncBadge(){}, notify:m=>notices.push(m),
    localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)},
    clearTimeout(){}, setTimeout:()=>1, doc:()=>({}), serverTimestamp:()=>null, console:{warn(){}},
    runTransaction:async (_db,fn)=>fn({ get:async()=>({exists:()=>db.data!==null,data:()=>db.data}), set:(_ref,value)=>{db.writes++;db.data=value;} }) });
  vm.runInContext(source,ctx);
  state.lastSyncedJSON = server === null ? null : ctx.stableSnapshotJSON(ctx.sharedSnapshotData(server));
  return {ctx,state,db,storage,notices};
}
test('transaction rejects a stale snapshot and preserves the local draft', async () => {
  const t = setup({ funds:[{id:'base'}] });
  t.ctx.schedulePush({funds:[{id:'mine'}]});
  t.db.data = {funds:[{id:'teammate'}]};
  await t.ctx.doPush();
  assert.equal(t.db.writes,0);
  assert.equal(t.db.data.funds[0].id,'teammate');
  assert.equal(t.state.syncError,true);
  assert.equal(t.state.dirty,true);
  assert.equal(JSON.parse(t.storage.get('ft_team_draft:user:org')).funds[0].id,'mine');
  assert.match(t.notices[0],/Export a backup/);
});
test('transaction writes only when the baseline matches and clears confirmed draft', async () => {
  const t = setup({ funds:[{id:'base'}] });
  t.ctx.schedulePush({funds:[{id:'mine'}]});
  await t.ctx.doPush();
  assert.equal(t.db.writes,1);
  assert.equal(t.db.data.funds[0].id,'mine');
  assert.equal(t.state.dirty,false);
  assert.equal(t.storage.size,0);
});
test('cannot write when the server baseline has not been confirmed', async () => {
  const t=setup(null); t.state.baselineReady=false;
  t.ctx.schedulePush({funds:[{id:'mine'}]});
  await t.ctx.doPush();
  assert.equal(t.db.writes,0); assert.equal(t.state.syncError,true);
  assert.equal(t.storage.size,1);
});
test('storage quota error prevents cloud write and leaves an explicit error', async () => {
  const t=setup(null); t.ctx.localStorage.setItem=()=>{throw Error('quota')};
  t.ctx.schedulePush({funds:[{id:'mine'}]});
  await t.ctx.doPush();
  assert.equal(t.db.writes,0); assert.equal(t.state.dirty,true); assert.equal(t.state.syncError,true);
});
test('recovery lock prevents replacing the saved draft with the current screen', () => {
  const t=setup(null); t.state.recoveryLocked=true;
  t.storage.set('ft_team_draft:user:org','saved draft');
  t.ctx.schedulePush({funds:[]});
  assert.equal(t.storage.get('ft_team_draft:user:org'),'saved draft');
});
test('edits made while a write is in flight are serialized and the draft is retained until both finish', async () => {
  const t = setup({funds:[{id:'base'}]});
  let release, started;
  const entered = new Promise(r=>{started=r});
  let calls=0;
  t.ctx.runTransaction=async (_db,fn)=>{
    calls++;
    const transaction={get:async()=>({exists:()=>t.db.data!==null,data:()=>t.db.data}),set:(_ref,value)=>{t.db.writes++;t.db.data=value;}};
    if (calls===1) { await new Promise(r=>{release=r;started()}); }
    await fn(transaction);
  };
  t.ctx.schedulePush({funds:[{id:'first'}]});
  const first=t.ctx.doPush(); await entered;
  t.ctx.schedulePush({funds:[{id:'second'}]});
  await t.ctx.doPush();
  assert.equal(t.db.writes,0);
  assert.equal(JSON.parse(t.storage.get('ft_team_draft:user:org')).funds[0].id,'second');
  release(); await first;
  await new Promise(r=>setImmediate(r));
  assert.equal(t.db.writes,2);
  assert.equal(t.db.data.funds[0].id,'second');
  assert.equal(t.storage.size,0);
  assert.equal(t.state.dirty,false);
});
test('legacy unversioned and absent snapshots start at revision one', async () => {
  for (const server of [null, {funds:[]}]) {
    const t=setup(server);
    t.ctx.schedulePush({funds:[{id:'new'}]});
    await t.ctx.doPush();
    assert.equal(t.db.data._syncRevision,1);
    assert.equal(t.state.lastSyncedRevision,1);
  }
});
test('revision detects an intervening change even when content returns to the same value', async () => {
  const t=setup({funds:[{id:'base'}],_syncRevision:7});
  t.ctx.schedulePush({funds:[{id:'mine'}]});
  t.db.data={funds:[{id:'base'}],_syncRevision:9};
  await t.ctx.doPush();
  assert.equal(t.db.writes,0); assert.equal(t.state.syncError,true);
  assert.equal(JSON.parse(t.storage.get('ft_team_draft:user:org')).funds[0].id,'mine');
});
test('invalid revisions fail closed and metadata is not included in financial snapshot', async () => {
  for(const revision of [-1,1.5,'1',null,Number.MAX_SAFE_INTEGER]) {
    const t=setup({funds:[],_syncRevision:revision});
    t.state.lastSyncedRevision=0;
    t.ctx.schedulePush({funds:[{id:'mine'}]});
    await t.ctx.doPush();
    assert.equal(t.db.writes,0); assert.equal(t.state.syncError,true);
  }
  const t=setup({funds:[],_syncRevision:3,updatedBy:'user',writerClientId:'other',updatedAt:null});
  assert.deepEqual(JSON.parse(t.state.lastSyncedJSON),{funds:[]});
});
test('checked-in rules require revision increments and prohibit deleting snapshots', () => {
  const rules=fs.readFileSync('firestore.rules','utf8');
  const block=rules.slice(rules.indexOf('match /data/{docId}'),rules.indexOf('// ---- invites ----'));
  assert.match(block,/request\.resource\.data\._syncRevision == 1/);
  assert.match(block,/request\.resource\.data\._syncRevision == resource\.data\.get\('_syncRevision', 0\) \+ 1/);
  assert.match(block,/allow delete: if false/);
});
