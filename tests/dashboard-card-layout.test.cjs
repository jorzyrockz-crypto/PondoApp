const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.slice(html.indexOf('/* Match dashboard fund and contribution cards'),html.indexOf('/* Desktop dashboard:'));
test('both sections use matching responsive single-row scrolling cards that can grow',()=>{
 assert.match(css,/#fundCards\.grid-funds,[\s\S]*?#dashboardContributionCards\.dashboard-contribution-rail\s*\{[\s\S]*?display:flex!important; flex-wrap:nowrap!important/);
 assert.match(css,/overflow-x:auto!important;[\s\S]*?scroll-snap-type:x proximity;[\s\S]*?touch-action:pan-x pan-y/);
 assert.match(css,/#fundCards > \.fund-card,[\s\S]*?#dashboardContributionCards > \.dashboard-contribution-card\s*\{[\s\S]*?flex:0 0 min\(84%,340px\);[\s\S]*?min-height:254px!important; height:auto/);
 assert.match(css,/@media screen and \(min-width:700px\)[\s\S]*?flex-basis:calc\(\(100% - 14px\) \/ 2\)/);
 assert.match(css,/padding:20px!important;[\s\S]*?border-radius:16px!important/);
});
test('contribution section is unboxed in light and dark and both cards share dark styling',()=>{
 assert.match(css,/#tab-dashboard \.dashboard-contributions,\s*body\.dark-mode #tab-dashboard \.dashboard-contributions\s*\{\s*padding:0!important; border:0!important; background:transparent!important; box-shadow:none!important/);
 assert.match(css,/body\.dark-mode #tab-dashboard #fundCards > \.fund-card,\s*body\.dark-mode #tab-dashboard #dashboardContributionCards > \.dashboard-contribution-card\s*\{\s*background:#172942!important/);
});
test('rails are keyboard focusable and retain card detail actions',()=>{
 assert.match(html,/id="fundCards" class="grid-funds" tabindex="0" role="region" aria-label="Funds: scroll horizontally to see more"/);
 assert.match(html,/id="dashboardContributionCards" class="dashboard-contribution-rail" tabindex="0" role="region" aria-label="Contribution activities: scroll horizontally to see more"/);
 assert.match(html,/card\.addEventListener\('keydown'.*openFundDetails/);
 assert.match(html,/card\.querySelector\('button'\)\.onclick=\(\)=>openContributionDetails/);
 assert.match(html,/function updateFundRailHint\(\)\{[^}]*rail\.scrollWidth<=rail\.clientWidth\+1/);
 assert.match(html,/fundCards\.innerHTML=fundCardsHtml; fundCards\.scrollLeft=fundScroll/);
});
test('empty fund and contribution cards have matching depth and responsive dimensions',()=>{
 assert.match(css,/#fundCards \.empty-state,[\s\S]*?#dashboardContributionCards \.empty-state \{[\s\S]*?min-height:254px[\s\S]*?border-radius:16px; background:#fff[\s\S]*?box-shadow:/);
 assert.match(css,/body\.dark-mode #tab-dashboard #fundCards \.empty-state,[\s\S]*?body\.dark-mode #tab-dashboard #dashboardContributionCards \.empty-state \{[\s\S]*?background:#172942!important/);
 assert.match(css,/@media screen and \(min-width:700px\)[\s\S]*?#fundCards > \.empty-state,[\s\S]*?#dashboardContributionCards > \.empty-state \{ flex-basis:calc/);
});
test('dashboard cards have a clean uniform border while icons and progress retain their color',()=>{
 assert.match(css,/border-radius:16px!important; background:#fff!important; border:1px solid #dbe4ef!important/);
 assert.match(css,/#fundCards > \.fund-card::before \{ display:none; \}/);
 assert.doesNotMatch(css,/border-top(?:-color)?:/);
 assert.match(html,/\.fund-card \.progress-fill,\.source-card \.source-track-fill,\.dashboard-contribution-track span\{background:var\(--card-color/);
});

test('contribution card titles match fund weight without the removed dashboard helper text',()=>{
 assert.match(css,/#tab-dashboard \.dashboard-contribution-card h3 \{ font-size:15px!important; font-weight:700!important; \}/);
 const dashboard=html.slice(html.indexOf('<!-- DASHBOARD -->'),html.indexOf('<!-- FUNDS -->'));
 assert.doesNotMatch(dashboard,/dashboardContributionSummary|dashboard-contribution-note|dashboardContributionSwipeHint|More activities/);
 assert.match(dashboard,/onclick="switchTab\('contributions'\)"/);
});
