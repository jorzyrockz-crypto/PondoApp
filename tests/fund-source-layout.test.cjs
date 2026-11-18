'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('faculty-fund-ui.js','utf8');
test('fund source list comes immediately after its header, before secondary views',()=>{
 const section=html.slice(html.indexOf('<!-- FUNDS -->'),html.indexOf('<!-- TRANSACTIONS -->'));
 assert.ok(section.indexOf('funds-list-heading')<section.indexOf('id="fundsList"'));
 assert.ok(section.indexOf('id="fundsList"')<section.indexOf('class="fund-extras no-print"'));
 assert.ok(section.indexOf('class="fund-extras no-print"')<section.indexOf('id="donationRegister"'));
 assert.ok(section.indexOf('id="donationRegister"')<section.indexOf('id="facultyFundRoot"'));
 assert.match(section,/Cash donations refer to fund-source receipts\. Faculty Fund is separate/);
 assert.match(section,/Search applies to these sources only/);
 assert.match(section,/id="facultyFundRecoveryRoot"[^>]*hidden/);
});
test('secondary views are accessible, responsive, and preserve the Faculty Fund test warning',()=>{
 assert.match(html,/id="donationRegisterTitle" tabindex="0"/);
 assert.match(html,/#tab-funds \.fund-extras-grid > \.faculty-fund\.is-open/);
 assert.match(html,/@media\(max-width:700px\)\{#tab-funds \.fund-extras/);
 assert.match(html,/body\.dark-mode #tab-funds \.fund-extras/);
 assert.match(ui,/root\.classList\.toggle\('is-open',opened\)/);
 assert.match(ui,/data-action="toggle" aria-expanded="\$\{opened\}"/);
 assert.match(ui,/REAL-ACCOUNT TEST ONLY — fictitious data only/);
 assert.match(ui,/Cash collected is income; remittances are handovers, not expenses/);
});
