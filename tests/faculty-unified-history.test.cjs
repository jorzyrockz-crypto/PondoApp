'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('Faculty history refuses late results after a workspace change and clears on invalidation',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');let finish;const window={pondoCurrentUser:{uid:'alice'},pondoTeamState:{orgId:'one',uid:'alice',role:'owner',memberConfirmed:true,members:[]},pondoFacultyAPI:{read:()=>new Promise(r=>{finish=r})}};const document={getElementById:()=>null};vm.runInNewContext(fs.readFileSync('faculty-fund-ui.js','utf8'),{window,document,navigator:{onLine:true},clearTimeout,setTimeout});const ui=window.PondoFacultyFundUI;
 const old=ui.refreshHistory();assert.equal(ui.historyView().status,'loading');window.pondoTeamState={...window.pondoTeamState,orgId:'two'};finish({state:{payments:[{id:'private'}],expenses:[],remittances:[]}});await old;assert.equal(ui.historyView().data,null);assert.equal(ui.historyView().status,'unavailable');
 const next=ui.refreshHistory();finish({state:{payments:[],expenses:[],remittances:[]}});await next;assert.equal(ui.historyView().status,'ready');ui.invalidateHistory();assert.equal(ui.historyView().data,null);assert.equal(ui.historyView().status,'unavailable');
});
