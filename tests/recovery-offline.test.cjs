'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('sw.js','utf8');
function setup(){
 const state={orgId:'team',uid:'owner',recoveryLocked:true,pushTimer:null,pushesInFlight:0,pendingSnapshot:null},draft=new Map([['ft_team_draft:owner:team','saved']]);
 const snapshot={funds:[{id:'fund'}]},window={pondoTeamState:state,pondoCurrentUser:{uid:'owner'},pondoGuestMode:false};
 const ctx=vm.createContext({window,trackerFatal:false,trackerPending:0,trackerRevision:5,currentSnapshot:()=>snapshot,localStorage:{getItem:k=>draft.get(k)??null},Date,JSON});
 const start=html.indexOf('function recoveryOfflineExitStillSafe('),end=html.indexOf('async function recoveryOfflineShellReady()',start);vm.runInContext(html.slice(start,end),ctx);
 return {ctx,state,draft,snapshot,exit:{state,org:'team',uid:'owner',key:'ft_team_draft:owner:team',raw:'saved',revision:5,snapshot:JSON.stringify(snapshot),time:Date.now()}};
}
test('recovery exit is valid only while the draft, account, workspace and writes remain unchanged',()=>{
 for(const mutate of [t=>t.draft.set(t.exit.key,'changed'),t=>t.draft.delete(t.exit.key),t=>t.state.orgId='other',t=>t.state.uid='other',t=>t.state.recoveryLocked=false,t=>t.ctx.window.pondoCurrentUser.uid='other',t=>t.ctx.window.pondoGuestMode=true,t=>t.state.pushTimer=1,t=>t.state.pushesInFlight=1,t=>t.state.pendingSnapshot={},t=>t.ctx.trackerPending=1,t=>t.ctx.trackerFatal=true,t=>t.ctx.trackerRevision++,t=>t.snapshot.funds.push({id:'later'}),t=>t.exit.time-=20000]){const t=setup();assert.equal(t.ctx.recoveryOfflineExitStillSafe(t.exit),true);mutate(t);assert.equal(t.ctx.recoveryOfflineExitStillSafe(t.exit),false);}
 const t=setup();t.ctx.localStorage.getItem=()=>{throw Error('unavailable')};assert.equal(t.ctx.recoveryOfflineExitStillSafe(t.exit),false);
});
test('active worker reports its cache version through an explicit message',()=>{
 const handlers={},self={addEventListener:(name,fn)=>handlers[name]=fn};vm.runInNewContext(worker,{self,URL});let answer;handlers.message({data:{type:'PONDO_GET_CACHE_VERSION'},ports:[{postMessage:x=>answer=x}]});assert.equal(answer.version,'pondo-v123');
});
test('recovery action is explicit, stays isolated, and preserves the draft',()=>{
 assert.match(html,/id="recoveryOfflineButton"[^>]*onclick="continueRecoveryOffline\(\)"/);assert.match(html,/does not contain team records/);assert.match(html,/localStorage\.getItem\(exit\.key\)===exit\.raw/);assert.match(html,/PONDO_RECOVERY_OFFLINE_INTENT/);assert.match(html,/sessionStorage\.removeItem\(PONDO_RECOVERY_OFFLINE_INTENT\)/);assert.match(html,/window\.pondoGuestMode\)return;/);
});
