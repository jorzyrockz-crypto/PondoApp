'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('faculty-fund-ui.js','utf8');
function uiSetup(){
 const values=new Map(),sent=[];const window={pondoCurrentUser:{uid:'owner'},pondoTeamState:{uid:'owner',orgId:'org~faculty fund test school',role:'owner',memberConfirmed:true,members:[{uid:'viewer',role:'reviewer'},{uid:'ao',role:'disbursing'}]},pondoFacultyAPI:{getRecoveryContext:()=>({}),read:async()=>({}),transition:async input=>{sent.push(input);return {ok:true}}}};
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 vm.runInNewContext(ui,{window,localStorage,navigator:{onLine:true},crypto:webcrypto,Intl,Uint8Array,Error,Set,Map,JSON,Number,String,Array});
 return {window,sent,values,expected:{uid:'owner',role:'owner',orgId:'org~faculty fund test school'}};
}
test('direct assignment uses the retry-safe protected Faculty Fund transition',async()=>{
 const t=uiSetup();await t.window.PondoFacultyFundUI.assignPresident('viewer',t.expected);assert.equal(t.sent.length,1);assert.equal(t.sent[0].operation,'assignPresident');assert.equal(t.sent[0].presidentUid,'viewer');assert.match(t.sent[0].requestId,/^[a-f0-9]{32}$/);assert.equal(t.values.size,0);
 await assert.rejects(t.window.PondoFacultyFundUI.assignPresident('ao',t.expected),/Viewer/);assert.equal(t.sent.length,1);
});
test('uncertain assignment keeps its retry token and never reports success',async()=>{
 const t=uiSetup();t.window.pondoFacultyAPI.transition=async input=>{t.sent.push(input);throw Error('network lost')};await assert.rejects(t.window.PondoFacultyFundUI.assignPresident('viewer',t.expected),/unconfirmed/);const saved=JSON.parse([...t.values.values()][0]);assert.equal(saved.requestId,t.sent[0].requestId);assert.equal(saved.operation,'assignPresident');assert.equal(saved.presidentUid,'viewer');
});
