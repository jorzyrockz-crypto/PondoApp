const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Desktop glass:'),html.indexOf('/* Dashboard funds:'));
test('desktop top bar has enhanced glass only when backdrop blur is supported',()=>{
 assert.match(css,/@media screen and \(min-width:901px\)/);
 assert.match(css,/@supports \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)/);
 assert.match(css,/body:not\(\.dark-mode\) \.topbar\{background:rgba\(255,255,255,\.82\)/);
 assert.match(css,/body\.dark-mode \.topbar\{background:rgba\(16,21,24,\.78\)/);
 assert.doesNotMatch(css,/\.bottomnav/);
});
test('reduced transparency and high contrast restore opaque backgrounds',()=>{
 assert.match(css,/prefers-reduced-transparency:reduce/);assert.match(css,/prefers-contrast:more/);
 assert.match(css,/background:#fff!important;backdrop-filter:none!important/);
 assert.match(css,/background:#101518!important;backdrop-filter:none!important/);
});
