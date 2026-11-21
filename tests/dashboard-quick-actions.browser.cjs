'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright-core');
async function main(){
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(data)});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});await page.locator('#authOfflineBtn').click();await page.waitForFunction(()=>window.trackerReady);await page.evaluate(()=>{if(typeof closePondoAbout==='function')closePondoAbout();});await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  const buttons=page.locator('.dashboard-hero-actions button');assert.deepEqual((await buttons.allTextContents()).map(x=>x.trim().replace(/\s+/g,' ')),['+ Refund','Transaction','+ Donation','+ Death Aid','+ Other Funds']);
  for(const mode of ['light','dark']){
   await page.evaluate(mode=>document.body.classList.toggle('dark-mode',mode==='dark'),mode);
   const colors=await buttons.evaluateAll(els=>els.map(e=>getComputedStyle(e).backgroundColor));assert.equal(new Set(colors).size,5,JSON.stringify({mode,colors}));
   for(const width of [320,390,800,1280]){
    await page.setViewportSize({width,height:900});const layout=await page.locator('.dashboard-hero-actions').evaluate(el=>({doc:document.documentElement.scrollWidth,viewport:innerWidth,buttons:[...el.querySelectorAll('button')].map(b=>({left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right,height:b.getBoundingClientRect().height,scroll:b.scrollWidth,client:b.clientWidth}))}));
    assert.ok(layout.doc<=width+1&&layout.buttons.every(b=>b.left>=-1&&b.right<=width+1&&b.height>=44&&b.scroll<=b.client+1),JSON.stringify({mode,width,layout}));
   }
  }
  await page.evaluate(()=>{window.quickActionMessage='';window.appAlert=m=>{quickActionMessage=m};window.quickActionSnapshot=JSON.stringify(currentSnapshot());});await page.locator('#dashboardOtherFunds').click();assert.equal(await page.locator('#otherPaymentOverlay').isVisible(),true);await page.locator('#otherPaymentOverlay .other-payment-close').click();assert.equal(await page.evaluate(()=>JSON.stringify(currentSnapshot())===quickActionSnapshot),true);assert.deepEqual(errors,[]);console.log('Overview quick actions: labels, colors, layout and modal passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}main().catch(e=>{console.error(e);process.exitCode=1});
