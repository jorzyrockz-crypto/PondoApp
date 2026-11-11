const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
const source = html.slice(html.indexOf('(function setupAppUpdates()'), html.indexOf('</script>', html.indexOf('(function setupAppUpdates()')));
function setup({controller = true, overlayVisible = false, waiting = true} = {}) {
  const listeners = {}, winListeners = {}, docListeners = {}, buttonMap = {}, notices = [], messages = [];
  for (const name of ['titlebarUpdateBtn','headerUpdateBtn','authUpdateBtn']) buttonMap[name] = {hidden:true, disabled:false, addEventListener(type,fn){this[type]=fn;}};
  const worker = {state:'installed', addEventListener(type,fn){this[type]=fn}, postMessage:data=>messages.push(data)};
  const reg = {waiting:waiting?worker:null, active:controller?{}:null, installing:null, addEventListener(type,fn){this[type]=fn}, update:async()=>{}};
  const overlay = {visible:overlayVisible, getTitlebarAreaRect:()=>({width:300,height:32}), addEventListener(type,fn){this[type]=fn}};
  const sw={controller:controller?{}:null,register:async()=>reg,addEventListener:(type,fn)=>{listeners[type]=fn}};
  let reloads=0;
  const ctx=vm.createContext({window:{trackerReady:true,pondoCurrentUser:{uid:'user'},pondoTeamState:null,appConfirm:async()=>true,appAlert:m=>notices.push(m),addEventListener:(k,f)=>{winListeners[k]=f}}, navigator:{serviceWorker:sw,windowControlsOverlay:overlay,onLine:true},document:{getElementById:id=>buttonMap[id],addEventListener:(k,f)=>{docListeners[k]=f},visibilityState:'visible'}, trackerFatal:false,trackerPending:0,storageWarningOpen:false,location:{reload(){reloads++}},setTimeout(){},setInterval(){},confirm:()=>true,alert:m=>notices.push(m),console,Date});
  vm.runInContext(source,ctx);
  return {ctx,reg,worker,sw,overlay,buttons:buttonMap,listeners,winListeners,notices,messages,get reloads(){return reloads},async load(){winListeners.load();await new Promise(r=>setImmediate(r));}};
}
test('waiting update shows header and login fallback, not titlebar',async()=>{
  const t=setup();await t.load();assert.equal(t.buttons.headerUpdateBtn.hidden,false);assert.equal(t.buttons.authUpdateBtn.hidden,false);assert.equal(t.buttons.titlebarUpdateBtn.hidden,true);
});
test('visible window controls overlay moves the button into its safe area',async()=>{
  const t=setup({overlayVisible:true});await t.load();assert.equal(t.buttons.titlebarUpdateBtn.hidden,false);assert.equal(t.buttons.headerUpdateBtn.hidden,true);
  t.overlay.visible=false;t.overlay.geometrychange();assert.equal(t.buttons.headerUpdateBtn.hidden,false);
});
test('update is activated only after confirmation and then reloads the initiating window',async()=>{
  const t=setup();await t.load();await t.buttons.headerUpdateBtn.click();assert.equal(t.messages[0].type,'PONDO_ACTIVATE_UPDATE');assert.equal(t.reloads,0);t.listeners.controllerchange();assert.equal(t.reloads,1);
});
test('pending local and unconfirmed team saves block an update',async()=>{
  const t=setup();await t.load();t.ctx.trackerPending=1;await t.buttons.headerUpdateBtn.click();assert.equal(t.messages.length,0);assert.match(t.notices.pop(),/local save/i);
  t.ctx.trackerPending=0;t.ctx.window.pondoTeamState={orgId:'org',dirty:true};await t.buttons.headerUpdateBtn.click();assert.equal(t.messages.length,0);assert.match(t.notices.pop(),/not confirmed/i);
});
test('another window activating an update never automatically reloads this one',async()=>{
  const t=setup({waiting:false});await t.load();t.listeners.controllerchange();assert.equal(t.reloads,0);assert.equal(t.buttons.headerUpdateBtn.hidden,false);
});
test('first installation does not announce an update',async()=>{
  const t=setup({controller:false,waiting:false});await t.load();t.listeners.controllerchange();assert.equal(t.buttons.headerUpdateBtn.hidden,true);assert.equal(t.reloads,0);
});
test('service worker only calls skipWaiting on explicit update message', async()=>{
  const code=fs.readFileSync('sw.js','utf8'), handlers={};let skipped=0;
  const self={addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{skipped++;return Promise.resolve()}};
  vm.runInNewContext(code,{self,URL,Promise});let waited;
  handlers.message({data:{type:'other'},waitUntil:p=>waited=p});assert.equal(skipped,0);
  handlers.message({data:{type:'PONDO_ACTIVATE_UPDATE'},waitUntil:p=>waited=p});await waited;assert.equal(skipped,1);
  assert.doesNotMatch(code.slice(code.indexOf("self.addEventListener('install'"),code.indexOf("self.addEventListener('message'")),/\.then\(\(\) => self\.skipWaiting/);
});

test('canceling confirmation leaves the update waiting',async()=>{
  const t=setup();await t.load();t.ctx.window.appConfirm=async()=>false;await t.buttons.headerUpdateBtn.click();assert.equal(t.messages.length,0);assert.equal(t.reloads,0);
});
test('a new unsaved edit during confirmation prevents activation',async()=>{
  const t=setup();await t.load();t.ctx.window.appConfirm=async()=>{t.ctx.trackerPending=1;return true};await t.buttons.headerUpdateBtn.click();assert.equal(t.messages.length,0);assert.match(t.notices[0],/local save/i);
});
test('activation while another save starts does not force a reload',async()=>{
  const t=setup();await t.load();await t.buttons.headerUpdateBtn.click();t.ctx.trackerPending=1;t.listeners.controllerchange();assert.equal(t.reloads,0);assert.equal(t.buttons.headerUpdateBtn.hidden,false);
});
