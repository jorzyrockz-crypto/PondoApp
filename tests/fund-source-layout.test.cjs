'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('regular and donation workspaces are accessible separate tabs',()=>{
 const section=html.slice(html.indexOf('<!-- FUNDS -->'),html.indexOf('<!-- TRANSACTIONS -->'));
 for(const id of ['regular','donations']){assert.match(section,new RegExp('id="fundTab-'+id+'" aria-controls="fundView-'+id+'"'));assert.match(section,new RegExp('id="fundView-'+id+'" role="tabpanel" aria-labelledby="fundTab-'+id+'"'));}
 assert.ok(section.indexOf('id="fundsList"')<section.indexOf('id="donationFundList"'));assert.ok(section.indexOf('id="donationFundList"')<section.indexOf('id="donationRegister"'));
 assert.match(section,/Regular funds referenced by older receipts stay under Regular Funds/);assert.match(html,/id="donationRegisterTitle" tabindex="-1"/);
});
