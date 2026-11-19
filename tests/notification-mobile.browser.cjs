/* Synthetic foreground workflow. Real Android permissions and sound need device testing. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
async function main(){
 const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(data)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 try{
  const page=await browser.newPage({viewport:{width:320,height:844}});await page.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>window.pondoTeamState={orgId:null});await page.locator('#authOfflineBtn').click();await page.waitForFunction(()=>window.trackerReady);
  await page.evaluate(()=>{if(typeof closePondoAbout==='function')closePondoAbout();window.pondoCurrentUser={uid:'owner'};window.pondoTeamState={orgId:'team',uid:'owner',role:'owner',memberConfirmed:true,baselineReady:true,online:true,members:[]};window.sounds=0;playSound=()=>sounds++;pushNotification({type:'team',title:'Refund needs review',body:'A request is waiting.',action:{tab:'refunds',memberRefundInbox:true}});});
  assert.equal(await page.locator('#pondoNotificationBanner').isVisible(),true);assert.match(await page.locator('#pondoNotificationBanner').innerText(),/Refund needs review/);assert.equal(await page.evaluate(()=>sounds),1);
  for(const width of [320,390,800]){await page.setViewportSize({width,height:844});const box=await page.locator('#pondoNotificationBanner').evaluate(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(box.left>=0&&box.right<=width+1&&box.scroll<=box.width+1,JSON.stringify({width,box}));}
  await page.locator('.pondo-notification-open').click();assert.equal(await page.locator('#tab-refunds').isVisible(),true);assert.equal(await page.locator('#pondoNotificationBanner').count(),0);assert.equal(await page.evaluate(()=>unreadNotificationCount()),0);
  await page.evaluate(()=>{pushNotification({type:'team',title:'Private alert',recipientUid:'owner',orgId:'team'});window.pondoTeamState.orgId='other';window.pondoValidateNotificationBanner();});assert.equal(await page.locator('#pondoNotificationBanner').count(),0);
  console.log('Foreground notification browser workflow passed (mock account and transport).');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
