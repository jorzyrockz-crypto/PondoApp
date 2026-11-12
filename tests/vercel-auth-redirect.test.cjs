const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const source=html.slice(html.indexOf('const firebaseConfig = {'),html.indexOf('// Analytics is intentionally not initialized'));
function authDomain(url){let context={location:new URL(url)};return vm.runInNewContext(source+'\nfirebaseConfig.authDomain',context)}
test('same-origin auth is limited to the exact HTTPS production domain',()=>{
 assert.equal(authDomain('https://pondoapp.vercel.app/'),'pondoapp.vercel.app');
 for(const url of ['http://pondoapp.vercel.app/','https://pondoapp.vercel.app:444/','https://preview.vercel.app/','https://jorzyrockz-crypto.github.io/PondoApp/','https://pondoapp.vercel.app.evil.test/'])assert.equal(authDomain(url),'russapps-pondo.firebaseapp.com',url);
});
test('Vercel rewrites only auth helpers to the same Firebase project',()=>{
 assert.equal(config.rewrites.length,1);assert.equal(config.rewrites[0].source,'/__/auth/:path*');assert.equal(config.rewrites[0].destination,'https://russapps-pondo.firebaseapp.com/__/auth/:path*');assert.equal(config.redirects,undefined);assert.equal(config.headers[0].source,'/__/auth/:path*');assert.equal(config.headers[0].headers.find(h=>h.key==='Cache-Control').value,'no-store');
});
test('service worker leaves same-origin Firebase auth helpers entirely to the network',()=>{
 let handler,responded=0,opened=0;const self={location:{href:'https://pondoapp.vercel.app/sw.js',origin:'https://pondoapp.vercel.app'},addEventListener:(type,fn)=>{if(type==='fetch')handler=fn}};
 vm.runInNewContext(sw,{self,URL,Promise,caches:{open(){opened++;throw Error('must not touch cache')}},fetch(){throw Error('must not intercept')}});
 for(const [path,mode] of [['/__/auth/iframe','no-cors'],['/__/auth/handler?state=abc','navigate'],['/__/auth/iframe.js','no-cors'],['/__/auth','navigate']])handler({request:{method:'GET',mode,url:'https://pondoapp.vercel.app'+path},respondWith(){responded++}});
 assert.equal(responded,0);assert.equal(opened,0);
});
test('rollout checklist calls out external configuration and device testing',()=>{
 const doc=fs.readFileSync('docs/android-pwa-sign-in.md','utf8');assert.match(doc,/https:\/\/pondoapp\.vercel\.app\/__\/auth\/handler/);assert.match(doc,/Authorized domains/);assert.match(doc,/actual Android phone and tablet/);assert.match(doc,/Don't clear site data or uninstall/);
});
