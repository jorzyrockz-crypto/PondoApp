const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const defaultAppSettings = {'),html.indexOf('let storedSettings;'));
const ctx=vm.createContext({CURRENCIES:{PHP:{},USD:{}}});vm.runInContext(source,ctx);
const normalize=value=>ctx.normalizeSettings(value);
test('new and partial settings use lavender and Logo Glow, while existing choices remain',()=>{
 const fresh=normalize(null),partial=normalize({appearance:{mode:'dark'},version:4}),saved=normalize({appearance:{accent:'teal',background:'softWave'},version:4});
 assert.equal(fresh.appearance.accent,'lavender');assert.equal(fresh.appearance.background,'logoGlow');
 assert.equal(partial.appearance.accent,'lavender');assert.equal(partial.appearance.background,'logoGlow');
 assert.equal(saved.appearance.accent,'teal');assert.equal(saved.appearance.background,'softWave');
 assert.doesNotMatch(html,/if\(appSettings\.version<4\)[^\n]*appearance\.(accent|background)/);
});
test('optional artwork background uses muted overlays and switches with orientation',()=>{
 assert.match(html,/data-bg="pondoArtwork"/);assert.match(html,/@media \(orientation:portrait\)\{:root\{--pondo-artwork:url\('assets\/branding\/login-portrait.jpg'\)/);
 assert.match(html,/body:not\(\.dark-mode\)\[data-background="pondoArtwork"\][^\n]*\.91/);
 assert.match(html,/body\.dark-mode\[data-background="pondoArtwork"\][^\n]*\.86/);
 assert.match(html,/a\.background==='pondoArtwork'/);
});
