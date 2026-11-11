const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const rawCss=html.slice(html.indexOf('/* Dashboard balance: accent-driven'),html.indexOf('/* Firebase auth gate */'));
const css=rawCss.replaceAll('.hero.hero--vibrant','.hero').replaceAll('.hero--vibrant ', '');
test('hero design follows the selected accent and keeps the watermark behind content',()=>{
 assert.match(css,/var\(--accent-strong\).*var\(--accent-deep\)/);
 assert.match(css,/\.hero>\*\{position:relative;z-index:1\}/);
 assert.match(css,/\.hero::after\{top:-12px!important;bottom:auto/);
 assert.match(css,/overflow-wrap:anywhere/);
 for(const id of ['totalRemaining','totalReceived','totalSpent','txCount','heroSub'])assert.match(html,new RegExp('id="'+id+'"'));
});
test('hero tile hover respects motion preferences',()=>{
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/body\.reduce-motion \.hero-stat/);
});

test('summary tiles use distinct readable colour blocks and decorative tilted icons',()=>{
 for(const color of ['#094d41','#00634d','#69233e','#870039','#19304e','#293d83'])assert.ok(css.includes(color));
 assert.match(css,/transform:rotate\(24deg\)/);assert.match(css,/min-height:154px/);assert.match(css,/rgba\(255,255,255,\.28\)/);
 assert.equal((html.match(/class="hero-stat-art"/g)||[]).length,3);
 const linear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
 for(const rgb of [[9,77,65],[0,99,77],[105,35,62],[135,0,57],[25,48,78],[41,61,131]]){let l=.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);assert.ok(1.05/(l+.05)>=4.5)}
});

test('summary values are prominent and subtitles align at the bottom with responsive sizing',()=>{
 assert.match(css,/display:flex;flex-direction:column;align-items:stretch/);
 assert.match(css,/font-size:clamp\(21px,2\.4vw,27px\)!important/);
 assert.match(css,/hero-stat-sub\{[^}]*margin-top:auto!important/);
 assert.match(css,/font-size:clamp\(14px,4vw,19px\)!important/);
});

test('tiles use translucent blurred glass with opaque accessibility fallbacks',()=>{
 assert.match(css,/@supports \(\(backdrop-filter:blur\(1px\)\)/);
 assert.match(css,/backdrop-filter:blur\(22px\) saturate\(1\.3\)!important/);
 assert.match(css,/rgba\(0,99,77,\.55\)/);
 assert.match(css,/prefers-reduced-transparency:reduce/);assert.match(css,/prefers-contrast:more/);
 assert.match(css,/backdrop-filter:none!important/);
});

test('translucent tile contrast remains readable even over a white backdrop',()=>{
 const linear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
 const luminance=rgb=>.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
 for(const rgb of [[9,77,65],[0,99,77],[105,35,62],[135,0,57],[25,48,78],[41,61,131]]){
  const bg=rgb.map((v,i)=>((.55*v+.45*255)*.66+.34*[5,8,16][i])*.96+.04*255);
  const secondary=bg.map(v=>.95*255+.05*v);
  assert.ok((luminance(secondary)+.05)/(luminance(bg)+.05)>=4.5);
 }
});

test('decorative currency watermark uses an angled glass tile and respects selected currency',()=>{
 assert.match(html,/content:var\(--currency-watermark/);
 assert.match(html,/root\.setProperty\('--currency-watermark', JSON\.stringify\(watermarkSymbol\)\)/);
 assert.match(css,/\.hero::after\{[^}]*background:rgba\(255,255,255,\.035\)/);
 assert.match(css,/\.hero::after\{[^}]*transform:rotate\(24deg\)/);
 assert.match(css,/\.hero::after\{[^}]*font-family:system-ui/);
 assert.match(css,/\.hero::after\{[^}]*color:rgba\(255,255,255,\.25\)!important/);
 assert.match(css,/font-size:clamp\(56px,7vw,95\.2px\)!important/);
 assert.match(css,/width:clamp\(90px,12vw,132px\)/);
 assert.match(css,/\.hero::after\{[^}]*backdrop-filter:blur\(8px\)/);
});

test('vibrant presentation is scoped and the classic skin hides decorative icons',()=>{
 assert.match(rawCss,/body \.hero\.hero--vibrant\{/);
 assert.match(rawCss,/\.hero--vibrant \.hero-stat:nth-child\(1\)/);
 assert.match(rawCss,/\.hero-stat-art\{display:none\}/);
 assert.match(rawCss,/\.hero--vibrant \.hero-stat-art\{display:block\}/);
 assert.match(html,/classList\.toggle\('hero--vibrant',a\.heroSkin==='vibrant'\)/);
 assert.match(html,/setAppearance\('heroSkin','vibrant'\)/);
 assert.match(html,/setAppearance\('heroSkin','classic'\)/);
});
