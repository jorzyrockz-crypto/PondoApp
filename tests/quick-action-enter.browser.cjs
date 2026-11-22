'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright-core');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{
  const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/, '')||'index.html');
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript'})[path.extname(file)]||'application/octet-stream');res.end(data)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.locator('#authOfflineBtn').click();await page.waitForFunction(()=>window.trackerReady);
  await page.evaluate(()=>{if(typeof closePondoAbout==='function')closePondoAbout();appSettings.motion.reduceMotion=true;document.activeElement.blur();window.beforeEnterTest=JSON.stringify(currentSnapshot());window.heldEnterReachedForm=0;document.getElementById('fabFundName').addEventListener('keydown',e=>{if(e.key==='Enter')heldEnterReachedForm++})});
  const overlay=page.locator('#quickActionOverlay'),query=page.locator('#quickActionQuery'),sheet=page.locator('#fabSheet');
  // Holding the shortcut used to repeat into the empty search and launch Add a fund.
  await page.keyboard.down('Enter');assert.equal(await overlay.isVisible(),true);await page.keyboard.down('Enter');await page.waitForTimeout(240);assert.equal(await overlay.isVisible(),true);assert.equal(await sheet.evaluate(e=>e.classList.contains('open')),false);await page.keyboard.up('Enter');
  // A fresh Enter on the empty search must not choose the first action either.
  await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);assert.equal(await sheet.evaluate(e=>e.classList.contains('open')),false);
  // Search and select with Enter; a held key must not reach the newly opened form.
  await query.fill('Add a fund');await page.keyboard.down('Enter');await page.locator('#fabForm-fund').waitFor({state:'visible'});await page.keyboard.down('Enter');await page.keyboard.down('Enter');assert.equal(await page.evaluate(()=>heldEnterReachedForm),0);await page.keyboard.up('Enter');
  await page.locator('#fabSheet .fab-close').click();assert.equal(await sheet.evaluate(e=>e.classList.contains('open')),false);assert.equal(await page.evaluate(()=>JSON.stringify(currentSnapshot())===beforeEnterTest),true);
  // The next Enter opens a clean Quick Action, not the form just cancelled.
  await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);assert.equal(await query.inputValue(),'');assert.equal(await sheet.evaluate(e=>e.classList.contains('open')),false);await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);
  // Explicit keyboard choice still works with an empty search via ArrowDown.
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.closest('#quickActionList')!==null),true);await page.keyboard.down('Enter');await page.locator('#fabForm-fund').waitFor({state:'visible'});await page.keyboard.down('Enter');assert.equal(await page.evaluate(()=>heldEnterReachedForm),0);await page.keyboard.up('Enter');await page.keyboard.press('Escape');assert.equal(await sheet.evaluate(e=>e.classList.contains('open')),false);
  await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);await query.fill('Record an unpaid supplier bill');await page.keyboard.press('Enter');await page.locator('#invoiceForm').waitFor({state:'visible'});await page.locator('#payableModal .payable-footer button').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#payableModal').isVisible(),false);assert.equal(await overlay.isVisible(),false);
  await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);assert.equal(await query.inputValue(),'');assert.equal(await page.locator('#payableModal').isVisible(),false);
  await query.fill('Record an Other Funds payment');await page.keyboard.press('Enter');await page.locator('#otherPaymentOverlay').waitFor({state:'visible'});await page.locator('#otherPaymentOverlay .other-payment-cancel').click();assert.equal(await page.locator('#otherPaymentOverlay').isVisible(),false);await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);assert.equal(await query.inputValue(),'');
  await query.fill('Create a contribution activity');await page.keyboard.press('Enter');await page.locator('#contributionFormOverlay').waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await page.locator('#contributionFormOverlay').isVisible(),false);await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);assert.equal(await query.inputValue(),'');
  assert.equal(await page.evaluate(()=>JSON.stringify(currentSnapshot())===beforeEnterTest),true);assert.deepEqual(errors,[]);console.log('Quick Action Enter repeat, cancellation, clean reopen, explicit selection and focus passed.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
