'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright-core');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{let f=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/, '')||'index.html');if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,d)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript'})[path.extname(f)]||'application/octet-stream');res.end(d)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const url='http://127.0.0.1:'+server.address().port+'/';
  async function start(context){const page=await context.newPage();await page.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());await page.goto(url);await page.locator('#authOfflineBtn').click();await page.waitForFunction(()=>window.trackerReady);await page.evaluate(()=>{if(typeof closePondoAbout==='function')closePondoAbout();appSettings.motion.reduceMotion=true});return page}
  // A phone sees the action immediately. Virtual-keyboard typing does not hide it.
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await start(touch),fab=page.locator('#fab'),overlay=page.locator('#quickActionOverlay');
  assert.equal(await fab.isVisible(),true);await fab.tap();assert.equal(await overlay.isVisible(),true);await page.locator('#quickActionQuery').focus();await page.keyboard.type('rec');assert.equal(await page.evaluate(()=>document.body.classList.contains('pondo-keyboard-active')),false,'touch-only text input may be virtual');
  await page.keyboard.press('Escape');await overlay.waitFor({state:'hidden'});assert.equal(await fab.isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('tab-section')),true);
  await page.touchscreen.tap(30,130);assert.equal(await fab.isVisible(),true);await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Enter');assert.equal(await overlay.isVisible(),true);assert.equal(await fab.isVisible(),false);await page.keyboard.press('Escape');await overlay.waitFor({state:'hidden'});await page.touchscreen.tap(30,130);assert.equal(await fab.isVisible(),true);await touch.close();
  // Mouse-only desktops must not see the floating button before any keypress,
  // after mouse use, or when their window is made phone-sized. Enter still works.
  const desktop=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),dp=await start(desktop),desktopFab=dp.locator('#fab');
  assert.equal(await desktopFab.isVisible(),false);await dp.mouse.move(200,200);await dp.mouse.click(200,200);assert.equal(await desktopFab.isVisible(),false);await dp.setViewportSize({width:390,height:844});assert.equal(await desktopFab.isVisible(),false);await dp.setViewportSize({width:1280,height:900});
  await dp.keyboard.press('Tab');assert.equal(await desktopFab.isVisible(),false);await dp.evaluate(()=>document.activeElement.blur());await dp.keyboard.press('Enter');assert.equal(await dp.locator('#quickActionOverlay').isVisible(),true);await dp.keyboard.press('Escape');await dp.locator('#quickActionOverlay').waitFor({state:'hidden'});assert.equal(await desktopFab.isVisible(),false);await desktop.close();
  // A hybrid laptop is touch-capable despite its desktop-sized viewport. Touch
  // restores the button after physical keyboard use without relying on width.
  const hybrid=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,reducedMotion:'reduce'}),hp=await start(hybrid),hybridFab=hp.locator('#fab');
  assert.equal(await hybridFab.isVisible(),true);await hp.keyboard.press('Tab');assert.equal(await hybridFab.isVisible(),false);await hp.touchscreen.tap(30,130);assert.equal(await hybridFab.isVisible(),true);await hybridFab.tap();assert.equal(await hp.locator('#quickActionOverlay').isVisible(),true);await hybrid.close();
  // If the browser does not expose a coarse-pointer media query, maxTouchPoints
  // still recognizes a touch-capable device.
  const fallback=await browser.newContext({viewport:{width:1000,height:800},reducedMotion:'reduce'});
  await fallback.addInitScript(()=>{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>2});const orig=window.matchMedia.bind(window);window.matchMedia=q=>q==='(any-pointer: coarse)'?{matches:false,media:q,addEventListener(){},removeEventListener(){}}:orig(q)});
  const fp=await start(fallback);assert.equal(await fp.locator('#fab').isVisible(),true);await fallback.close();
  // A real touch also works when both capability signals are missing.
  const observed=await browser.newContext({viewport:{width:1000,height:800},hasTouch:true,reducedMotion:'reduce'});
  await observed.addInitScript(()=>{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>0});const orig=window.matchMedia.bind(window);window.matchMedia=q=>q==='(any-pointer: coarse)'?{matches:false,media:q,addEventListener(){},removeEventListener(){}}:orig(q)});
  const op=await start(observed);assert.equal(await op.locator('#fab').isVisible(),false);await op.touchscreen.tap(30,130);assert.equal(await op.locator('#fab').isVisible(),true);await op.locator('#fab').tap();assert.equal(await op.locator('#quickActionOverlay').isVisible(),true);await observed.close();
  // Capability changes must update visibility and move focus off a removed button.
  const dynamic=await browser.newContext({viewport:{width:1000,height:800},reducedMotion:'reduce'});
  await dynamic.addInitScript(()=>{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>0});const orig=window.matchMedia.bind(window),listeners=new Set(),media={matches:false,media:'(any-pointer: coarse)',addEventListener:(type,fn)=>{if(type==='change')listeners.add(fn)},removeEventListener:(type,fn)=>listeners.delete(fn)};window.matchMedia=q=>q===media.media?media:orig(q);window.setTestCoarse=value=>{media.matches=value;for(const fn of listeners)fn({matches:value,media:media.media})}});
  const cp=await start(dynamic),changingFab=cp.locator('#fab');assert.equal(await changingFab.isVisible(),false);await cp.evaluate(()=>setTestCoarse(true));assert.equal(await changingFab.isVisible(),true);await changingFab.focus();assert.equal(await cp.evaluate(()=>document.activeElement.id),'fab');await cp.evaluate(()=>setTestCoarse(false));assert.equal(await changingFab.isVisible(),false);assert.notEqual(await cp.evaluate(()=>document.activeElement.id),'fab');await dynamic.close();
  console.log('Touch capability, hybrid input, mouse-only visibility, keyboard shortcut and capability changes passed.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
