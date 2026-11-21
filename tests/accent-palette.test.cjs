'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('function accentRGB('),end=html.indexOf('function applyAppearance()',start);
const ctx={};vm.runInNewContext(html.slice(start,end),ctx);
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
test('accent roles retain contrast across a broad range of custom colors',()=>{
 for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){
  const hex='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''),p=ctx.accentPalette(hex);
  assert.ok(ctx.accentContrast(rgb(p.strong),[255,255,255])>=5.5,hex+' white button');
  assert.ok(ctx.accentContrast(rgb(p.strong),rgb(p.lightBg))>=4.5,hex+' light nav');
  assert.ok(ctx.accentContrast(rgb(p.onDark),rgb(p.darkBg))>=4.5,hex+' dark nav');
  assert.ok(ctx.accentContrast(rgb(p.onDark),[23,41,66])>=4.5,hex+' dark surface');
 }
});
test('invalid custom colors fall back safely',()=>{
 assert.equal(ctx.readableAccent('not a color'),ctx.readableAccent('#059669'));
 assert.equal(ctx.accentPalette('#zzzzzz').raw,'#059669');
});
