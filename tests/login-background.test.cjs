const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
test('login background uses supplied landscape and portrait images in both themes',()=>{
 assert.match(html,/\.auth-gate\{[^}]*login-landscape\.jpg/);
 assert.match(html,/@media\s*\(orientation:portrait\)\s*\{\.auth-gate\{background-image:url\('assets\/branding\/login-portrait\.jpg'\)/);
 assert.doesNotMatch(html,/body\.dark-mode\s+\.auth-gate\s*\{/);
 for(const name of ['login-portrait.jpg','login-landscape.jpg']){
  assert.ok(fs.existsSync('assets/branding/'+name));assert.ok(sw.includes('./assets/branding/'+name));
 }
});

test('wide landscape shows a left-aligned branded layout while portrait keeps its centered card',()=>{
 assert.match(html,/@media \(orientation:landscape\) and \(min-width:700px\) and \(min-height:560px\)/);
 assert.match(html,/\.auth-gate\{justify-content:flex-start;padding-left:/);
 assert.match(html,/class="auth-landscape-brand" aria-hidden="true"/);
 assert.match(html,/\.auth-landscape-brand\{display:none/);
 assert.match(html,/id="authOfflineBtn"/);
 assert.match(html,/overflow-y:auto;padding:24px;background:#0c0b26/);
});
