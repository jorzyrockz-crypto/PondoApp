const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
const source=html.slice(html.indexOf('const firebaseConfig = {'),html.indexOf('// Analytics is intentionally not initialized'));
function authDomain(url){let context={location:new URL(url)};return vm.runInNewContext(source+'\nfirebaseConfig.authDomain',context)}
test('rollback restores the Firebase auth domain across production and other hosts',()=>{
 for(const url of ['https://pondoapp.vercel.app/','http://pondoapp.vercel.app/','https://preview.vercel.app/','https://jorzyrockz-crypto.github.io/PondoApp/'])assert.equal(authDomain(url),'russapps-pondo.firebaseapp.com',url);
 assert.equal(fs.existsSync('vercel.json'),false,'the unused auth rewrite was removed');
});
test('service worker leaves same-origin auth helpers to the network',()=>{
 let handler,responded=0,opened=0;const self={location:{href:'https://pondoapp.vercel.app/sw.js',origin:'https://pondoapp.vercel.app'},addEventListener:(type,fn)=>{if(type==='fetch')handler=fn}};
 vm.runInNewContext(sw,{self,URL,Promise,caches:{open(){opened++;throw Error('must not touch cache')}},fetch(){throw Error('must not intercept')}});
 for(const [path,mode] of [['/__/auth/iframe','no-cors'],['/__/auth/handler?state=abc','navigate'],['/__/auth/iframe.js','no-cors'],['/__/auth','navigate']])handler({request:{method:'GET',mode,url:'https://pondoapp.vercel.app'+path},respondWith(){responded++}});
 assert.equal(responded,0);assert.equal(opened,0);
});
test('Android popup guidance covers blocked popups, device testing, and local data safety',()=>{
 const doc=fs.readFileSync('docs/android-pwa-sign-in.md','utf8');assert.match(doc,/popup flow/);assert.match(doc,/installed Android phone and tablet/);assert.match(doc,/blocks the popup/);assert.match(doc,/may not share/);assert.match(doc,/do not\s+clear site data or uninstall/i);assert.match(doc,/real-device testing/i);
});
