const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const code = html.slice(html.indexOf('// Density and scale are local device preferences'), html.indexOf('function setSoundPackFull'));
function device(initial, appearance = {fontScale: 100, density: 'comfortable'}) {
  const data = {...initial}; let changed;
  const localStorage = {
    getItem: k => Object.hasOwn(data, k) ? data[k] : null,
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
  const ctx = vm.createContext({localStorage, appSettings: {appearance: {...appearance}}, window: {addEventListener: (_, cb) => {changed = cb;}}, syncSettingsUI(){}, applyAppearance(){}, appAlert(){}});
  vm.runInContext(code, ctx);
  return {data, ctx, run: js => vm.runInContext(js, ctx), changed: event => changed(event)};
}
test('migrates legacy locked scale and clamps it to 90%', () => {
  const d = device({ft_device_scale_lock:'1', ft_device_scale_value:'85'}, {fontScale:115,density:'compact'});
  assert.deepEqual(JSON.parse(d.data.ft_device_appearance), {fontScale:90,density:'compact'});
});
test('seeds unlocked legacy preferences and persists local changes', () => {
  const d = device({}, {fontScale:105,density:'compact'});
  d.run("setFontScale('115'); setDeviceDensity('extra-compact')");
  assert.deepEqual(JSON.parse(d.data.ft_device_appearance), {fontScale:115,density:'extra-compact'});
  assert.equal(d.ctx.appSettings.appearance.fontScale,105);
  assert.equal(d.ctx.appSettings.appearance.density,'compact');
  const reopened=device(d.data,{fontScale:90,density:'comfortable'});
  assert.equal(reopened.run('effectiveFontScale()'),115);
  assert.equal(reopened.run('effectiveDensity()'),'extra-compact');
});
test('remote settings cannot overwrite local appearance', () => {
  const d = device({}, {fontScale:100,density:'comfortable'});
  d.run("setFontScale('90'); setDeviceDensity('compact'); appSettings.appearance={fontScale:115,density:'extra-compact'}");
  assert.equal(d.run('effectiveFontScale()'),90);
  assert.equal(d.run('effectiveDensity()'),'compact');
});
test('clamps invalid scales, rejects invalid density, and resets', () => {
  const d=device({});
  d.run("setFontScale('80'); setDeviceDensity('bad')");
  assert.equal(d.run('effectiveFontScale()'),90);
  assert.equal(d.run('effectiveDensity()'),'comfortable');
  d.run("setFontScale('130'); setDeviceDensity('extra-compact')");
  assert.equal(d.run('effectiveFontScale()'),115);
  d.run('resetDeviceAppearance()');
  assert.deepEqual(JSON.parse(d.data.ft_device_appearance), {fontScale:100,density:'comfortable'});
});
test('other tabs can update the local preference', () => {
  const d=device({});
  d.data.ft_device_appearance=JSON.stringify({fontScale:95,density:'extra-compact'});
  d.changed({key:'ft_device_appearance'});
  assert.equal(d.run('effectiveFontScale()'),95);
  assert.equal(d.run('effectiveDensity()'),'extra-compact');
});
