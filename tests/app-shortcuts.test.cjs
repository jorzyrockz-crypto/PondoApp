const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const source=html.slice(html.indexOf('function applyAppShortcut(){'),html.indexOf('// Only one upgraded tracker tab',html.indexOf('function applyAppShortcut(){')));
function run(href){
 const calls=[],replaced=[],heading={focus:opts=>calls.push(['focus',opts.preventScroll])};
 const ctx=vm.createContext({URL,location:{href},history:{state:{foo:1},replaceState:(_state,_title,url)=>replaced.push(url)},document:{querySelector:()=>heading},switchTab:tab=>calls.push(['tab',tab])});
 vm.runInContext(source,ctx);ctx.applyAppShortcut();return {calls,replaced};
}
test('shortcuts point within app scope to supported views with cached icons',()=>{
 assert.equal(manifest.shortcuts.length,5);
 const views=new Set(['funds','projects','contributions','refunds','report']);
 for(const shortcut of manifest.shortcuts){let url=new URL(shortcut.url,'https://example.test/PondoApp/');assert.equal(url.pathname,'/PondoApp/index.html');assert.ok(views.delete(url.searchParams.get('shortcut')));for(const icon of shortcut.icons)assert.ok(fs.existsSync(icon.src));}
 assert.equal(views.size,0);
});
test('shortcut opens only an allowed view and preserves other query and hash',()=>{
 for(const value of ['funds','projects','contributions','refunds','report']){
  let t=run('https://example.test/PondoApp/index.html?shortcut='+value+'&invite=123#example');
  assert.deepEqual(t.calls,[['tab',value],['focus',true]]);let url=new URL(t.replaced[0]);assert.equal(url.searchParams.has('shortcut'),false);assert.equal(url.searchParams.get('invite'),'123');assert.equal(url.hash,'#example');
 }
 let t=run('https://example.test/PondoApp/index.html?shortcut=../../bad');assert.deepEqual(t.calls,[]);assert.deepEqual(t.replaced,[]);
});
test('shortcut runs only after tracker initialization',()=>{
 assert.match(html,/window\.trackerReady=true;applyAppShortcut\(\)/);
});
