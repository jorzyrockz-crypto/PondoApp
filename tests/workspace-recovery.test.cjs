const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('index.html', 'utf8');

function workspace(cache) {
  const source = app.slice(app.indexOf('window.pondoWorkspace={'), app.indexOf('(function seedPersonalWorkspaceCache'));
  const ctx = { window: {}, localStorage: cache, currentSnapshot: () => ({ funds: [{ id: 'one' }] }), blankWorkspaceSnapshot: () => ({}), trackerQueue: Promise.resolve(), trackerFatal: false, trackerPending: 0 };
  vm.runInNewContext(source, ctx);
  return { api: ctx.window.pondoWorkspace, ctx };
}

test('workspace cache reports quota and verification failures instead of silently succeeding', () => {
  let { api } = workspace({ setItem() { throw Error('quota'); }, getItem() { return null; } });
  assert.equal(api.save('personal'), false);
  ({ api } = workspace({ setItem() {}, getItem() { return null; } }));
  assert.equal(api.save('personal'), false);
  const data = new Map();
  ({ api } = workspace({ setItem(k, v) { data.set(k, v); }, getItem(k) { return data.get(k) ?? null; } }));
  assert.equal(api.save('personal'), true);
  assert.equal(JSON.parse(data.get('ft_ws_cache:personal')).funds[0].id, 'one');
});

test('flush waits for outstanding local save and detects fatal storage errors', async () => {
  let resolve;
  const { api, ctx } = workspace({});
  ctx.trackerPending = 1;
  ctx.trackerQueue = new Promise(r => { resolve = () => { ctx.trackerPending = 0; r(); }; });
  let completed = false;
  const result = api.flush().then(v => { completed = true; return v; });
  await Promise.resolve();
  assert.equal(completed, false);
  resolve();
  assert.equal(await result, true);
  ctx.trackerFatal = true;
  assert.equal(await api.flush(), false);
});

test('workspace switch refuses pending cloud saves and failed local cache writes', async () => {
  const source = app.slice(app.indexOf('async function switchActiveWorkspace(key)'), app.indexOf('// Looks up name + role'));
  let messages = [], applied = false, cacheSaved = false;
  const state = { orgId: 'team', pushTimer: null, pushesInFlight: 1 };
  const ctx = { pondoTeamState: state, notify: m => messages.push(m), window: {
    pondoWorkspace: { flush: async () => true, load: () => null, save: () => { cacheSaved = true; return false; } },
    applySnapshot: () => { applied = true; }, renderAll() {},
  } };
  vm.runInNewContext(source, ctx);
  await ctx.switchActiveWorkspace('personal');
  assert.match(messages.pop(), /awaiting confirmation/);
  assert.equal(cacheSaved, false);
  state.pushesInFlight = 0;
  await ctx.switchActiveWorkspace('personal');
  assert.match(messages.pop(), /Could not save this workspace/);
  assert.equal(applied, false);
  assert.equal(state.orgId, 'team');
});

test('unreadable or malformed destination cache is rejected without switching', async () => {
  const { api } = workspace({ getItem: () => '{bad json' });
  assert.throws(() => api.load('team'));
  const invalid = workspace({ getItem: () => JSON.stringify({org: {}, funds: []}) });
  assert.throws(() => invalid.api.load('team'), /Invalid workspace cache/);
  const missing = workspace({ getItem: () => null });
  assert.equal(missing.api.load('team'), null);
  const source = app.slice(app.indexOf('async function switchActiveWorkspace(key)'), app.indexOf('// Looks up name + role'));
  let messages = [], saved = false;
  const state = { orgId: null, pushTimer: null, pushesInFlight: 0 };
  const ctx = { pondoTeamState: state, notify: m => messages.push(m), window: {
    pondoWorkspace: { flush: async () => true, load: () => { throw Error('invalid cache'); }, save: () => { saved = true; } },
    applySnapshot() { throw Error('must not apply'); }, renderAll() {},
  } };
  vm.runInNewContext(source, ctx);
  await ctx.switchActiveWorkspace('team');
  assert.match(messages[0], /destination workspace cache could not be read/);
  assert.equal(saved, false);
  assert.equal(state.orgId, null);
});
