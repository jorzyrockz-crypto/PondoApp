const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const defaultAppSettings = {'),html.indexOf('let storedSettings;'));
const ctx=vm.createContext({CURRENCIES:{PHP:{},USD:{}}});vm.runInContext(source,ctx);
const normalize=value=>ctx.normalizeSettings(value);
test('new and partial settings use light mode, lavender and Pondo Artwork while existing choices remain',()=>{
 const fresh=normalize(null),partial=normalize({appearance:{mode:'dark'},version:4}),saved=normalize({appearance:{mode:'dark',accent:'teal',background:'softWave'},version:4});
 assert.equal(fresh.appearance.mode,'light');assert.equal(fresh.appearance.accent,'lavender');assert.equal(fresh.appearance.background,'pondoArtwork');
 assert.equal(partial.appearance.mode,'dark');assert.equal(partial.appearance.accent,'lavender');assert.equal(partial.appearance.background,'pondoArtwork');
 assert.equal(saved.appearance.mode,'dark');assert.equal(saved.appearance.accent,'teal');assert.equal(saved.appearance.background,'softWave');
 assert.doesNotMatch(html,/if\(appSettings\.version<4\)[^\n]*appearance\.(accent|background)/);
});
test('optional artwork background uses muted overlays and switches with orientation',()=>{
 assert.match(html,/data-bg="pondoArtwork"/);assert.match(html,/@media \(orientation:portrait\)\{:root\{--pondo-artwork:url\('assets\/branding\/login-portrait.jpg'\)/);
 assert.match(html,/body:not\(\.dark-mode\)\[data-background="pondoArtwork"\][^\n]*\.85/);
 assert.match(html,/body\.dark-mode\[data-background="pondoArtwork"\][^\n]*\.86/);
 assert.match(html,/a\.background==='pondoArtwork'/);
});

test('light artwork keeps secondary text readable over the darkest image pixels',()=>{
 assert.match(html,/body:not\(\.dark-mode\)\[data-background="pondoArtwork"\]\{--ink2:#53545a/);
 const linear=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4};
 const luminance=rgb=>0.2126*linear(rgb[0])+0.7152*linear(rgb[1])+0.0722*linear(rgb[2]);
 const darkestBackground=[248,247,252].map(c=>Math.floor(c*0.85));
 assert.ok((luminance(darkestBackground)+0.05)/(luminance([83,84,90])+0.05)>=4.5);
});

test('hero skin defaults to classic and preserves valid saved choices',()=>{
 assert.equal(normalize(null).appearance.heroSkin,'classic');
 assert.equal(normalize({appearance:{heroSkin:'vibrant'}}).appearance.heroSkin,'vibrant');
 assert.equal(normalize({appearance:{heroSkin:'unexpected'}}).appearance.heroSkin,'classic');
});
