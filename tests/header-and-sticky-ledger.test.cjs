const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');

test('desktop contribution column headers stick to the modal scrollport', () => {
  assert.match(html, /\.contribution-detail \.detail-body \{ padding-top:14px; \}/);
  assert.match(html, /@media screen and \(min-width:768px\)\s*\{[^}]*\.contribution-detail \.contrib-table-wrap \{overflow:visible\}[^}]*\.contribution-detail \.contrib-table thead th \{position:sticky;top:-14px;z-index:3\}/);
  assert.match(html, /\.contribution-detail \.contrib-table thead th[^\n]*background:/);
});

test('header uses the Pondo icon and allows long workspace and account labels to shrink', () => {
  assert.match(html, /id="appHeaderLogo"><img src="icons\/icon-96\.png" alt=""/);
  assert.match(html, /#pondoApp \.topbar-inner > \.pondo-identity \{flex:1 1 220px!important;min-width:124px!important\}/);
  assert.match(html, /#pondoApp \.topbar-inner > \.pondo-header-actions \{flex:0 1 auto!important;min-width:0/);
  assert.match(html, /\.team-switcher-wrap \{min-width:44px;flex:0 1 auto\}/);
  assert.match(html, /#userChip \{flex:0 1 160px;min-width:35px;overflow:hidden\}/);
  assert.match(html, /\.topbar \.app-tagline \{max-width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis\}/);
  assert.match(html, /body\.app-update-available \.topbar-inner \{flex-wrap:wrap!important/);
  assert.match(html, /\.pondo-header-actions \{position:relative\}\s*\.header-avatar-wrap \{position:static\}\s*\.header-avatar-menu \{right:0;max-width:calc\(100vw - 24px\)\}/);
});
