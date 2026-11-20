'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('faculty-fund-ui.js','utf8');
test('fund source and receipt workspaces are in accessible separate tabs',()=>{
 const section=html.slice(html.indexOf('<!-- FUNDS -->'),html.indexOf('<!-- TRANSACTIONS -->'));
 for(const id of ['regular','donations','faculty']){assert.match(section,new RegExp('id="fundTab-'+id+'" aria-controls="fundView-'+id+'"'));assert.match(section,new RegExp('id="fundView-'+id+'" role="tabpanel" aria-labelledby="fundTab-'+id+'"'));}
 assert.ok(section.indexOf('id="fundsList"')<section.indexOf('id="donationFundList"'));assert.ok(section.indexOf('id="donationFundList"')<section.indexOf('id="donationRegister"'));assert.ok(section.indexOf('id="donationRegister"')<section.indexOf('id="facultyFundRoot"'));
 assert.match(section,/Regular funds referenced by older receipts stay under Regular Funds/);assert.match(section,/id="facultyFundRecoveryRoot"[^>]*hidden/);
});
test('secondary views are accessible, responsive, and preserve the Faculty Fund test warning',()=>{
 assert.match(html,/id="donationRegisterTitle" tabindex="0"/);
 assert.match(html,/#tab-funds \.fund-extras-grid > \.faculty-fund\.is-open/);
 assert.match(html,/@media\(max-width:700px\)\{#tab-funds \.fund-extras/);
 assert.match(html,/body\.dark-mode #tab-funds \.fund-extras/);
 assert.match(ui,/aria-haspopup="dialog" aria-expanded="\$\{opened\}"/);
 assert.match(ui,/role="dialog" aria-modal="true" aria-labelledby="facultyModalTitle"/);
 assert.match(ui,/\['collections','Collections'\]/);
 assert.match(ui,/\['handovers','Handovers'\]/);
 assert.match(ui,/selectPage\(nav.dataset.facultyNav\)/);
 assert.match(html,/\.faculty-modal\{position:fixed/);
 assert.match(ui,/REAL-ACCOUNT TEST ONLY — fictitious data only/);
 assert.match(ui,/Cash collected is income; remittances are handovers, not expenses/);
});
