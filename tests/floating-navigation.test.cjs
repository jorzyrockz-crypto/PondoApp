const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Keep the final content reachable'),html.indexOf('/* Firebase auth gate */'));
test('page clearance and quick-add placement include device safe area',()=>{
 assert.match(css,/main\.wrap\{padding-bottom:calc\(180px \+ env\(safe-area-inset-bottom, 0px\)\)!important/);
 assert.match(css,/\.fab\{bottom:calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\)!important/);
 assert.match(css,/@media\(min-width:600px\)/);
 assert.match(css,/width:min\(580px,calc\(100% - 24px\)\)/);
 assert.match(html,/\.bottomnav \.nav-btn,\.bottomnav \.nav-btn\.active\{width:100%;min-height:48px/);
});
test('dock glass has reduced-transparency and high-contrast fallbacks',()=>{
 assert.match(css,/@supports \(\(backdrop-filter:blur\(1px\)\)/);
 assert.match(css,/body\.dark-mode \.bottomnav\{background:rgba\(16,21,24,\.82\)/);
 assert.match(css,/prefers-reduced-transparency:reduce/);assert.match(css,/prefers-contrast:more/);
 assert.match(css,/background:#fff!important;backdrop-filter:none!important/);
 assert.match(css,/background:#101518!important;backdrop-filter:none!important/);
});
