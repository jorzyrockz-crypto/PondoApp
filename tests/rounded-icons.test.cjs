const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
function checkPng(path,size){const b=fs.readFileSync(path);assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size);assert.equal(b[25],6,'PNG has an alpha channel');assert.ok(sw.includes('./'+path));}
test('browser favicons use rounded transparent assets',()=>{
 for(const size of [16,32,48]){const p=`icons/rounded/favicon-${size}x${size}.png`;assert.ok(html.includes(p));checkPng(p,size)}
 assert.ok(html.includes('icons/rounded/favicon.ico'));assert.ok(sw.includes('./icons/rounded/favicon.ico'));
});
test('ordinary installed app icons have alpha; maskable and original assets remain separate',()=>{
 for(const icon of manifest.icons){
  if(icon.purpose==='any'){assert.match(icon.src,/^icons\/rounded\//);checkPng(icon.src,Number.parseInt(icon.sizes));}
  else if(icon.purpose==='maskable'){assert.doesNotMatch(icon.src,/rounded/);assert.ok(fs.existsSync(icon.src));}
 }
 assert.ok(fs.existsSync('icons/icon-512.png'));assert.ok(html.includes('icons/apple-touch-icon.png'));
});
