'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{chromium}=require('playwright-core');
function rgb(value){const m=value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);assert.ok(m,value);return m.slice(1,4).map(Number)}
function luminance(c){return c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/, '')||'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(data)})});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const viewport of [{width:390,height:844,touch:true},{width:768,height:1024,touch:true},{width:1280,height:800,touch:false}]){
   const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},hasTouch:viewport.touch,isMobile:viewport.touch});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#authOfflineBtn').click();await page.waitForFunction(()=>window.trackerReady);await page.evaluate(()=>{if(typeof closePondoAbout==='function')closePondoAbout();openSettings();switchSettingsTab('appearance')});
   const swatches=page.locator('.accent-picker .accent-dot');assert.equal(await swatches.count(),8);assert.equal(await swatches.filter({hasText:'✓'}).getAttribute('aria-label'),'Lavender accent');
   const getColors=()=>page.evaluate(()=>{const nav=document.querySelector('.bottomnav .nav-btn.active'),label=nav.querySelector('.nav-label'),icon=nav.querySelector('svg'),hero=document.querySelector('.hero-amount'),fab=document.querySelector('.fab');return {navBg:getComputedStyle(nav).backgroundColor,navText:getComputedStyle(label).color,icon:getComputedStyle(icon).stroke,hero:getComputedStyle(hero).color,heroBg:getComputedStyle(document.querySelector('.hero')).backgroundColor,fab:getComputedStyle(fab).backgroundColor,fabColor:getComputedStyle(fab).color,root:getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim()}});
   for(const mode of ['light','dark']){
    await page.evaluate(m=>setAppearance('mode',m),mode);
    let prev=null;
    for(const color of ['emerald','amber','violet','blue','rose','forest','lavender']){
     const swatch=page.locator(`.accent-dot[data-accent="${color}"]`);await swatch.click();await page.waitForFunction(c=>appSettings.appearance.accent===c,color);
     // Allow existing navigation transitions to settle before inspecting contrast.
     await page.waitForTimeout(250);
     assert.equal(await swatch.getAttribute('aria-pressed'),'true');assert.equal(await swatches.filter({hasText:'✓'}).count(),1);
     const swatchStyle=await swatch.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,swatch:el.style.getPropertyValue('--swatch'),size:el.getBoundingClientRect().width}));assert.equal(swatchStyle.bg,'rgb('+swatchStyle.swatch.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)).join(', ')+')');assert.ok(contrast(rgb(swatchStyle.color),rgb(swatchStyle.bg))>=4.5,JSON.stringify(swatchStyle));assert.ok(swatchStyle.size>=44);
     const values=await getColors();assert.equal(values.hero,values.navText,JSON.stringify({viewport,mode,color,values}));assert.ok(contrast(rgb(values.navText),rgb(values.navBg))>=4.5,JSON.stringify({viewport,mode,color,values}));assert.ok(contrast(rgb(values.hero),rgb(values.heroBg))>=4.5,JSON.stringify({viewport,mode,color,values}));assert.ok(contrast(rgb(values.fab),rgb(values.fabColor))>=4.5,JSON.stringify({viewport,mode,color,values}));assert.equal(values.icon,values.navText);if(prev)assert.notEqual(values.root,prev);prev=values.root;
    }
   }
   // Native keyboard controls and custom picker selection survive settings reload.
   await page.locator('.accent-dot[data-accent="teal"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.accent-dot[data-accent="teal"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.accent-dot[data-accent="teal"]').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
   await page.locator('#customAccent').evaluate(e=>{e.value='#ffff00';e.dispatchEvent(new Event('change',{bubbles:true}))});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>appSettings.appearance.accent),'custom');assert.equal(await swatches.filter({hasText:'✓'}).count(),0);assert.equal(await page.locator('.custom-accent-label').evaluate(e=>e.classList.contains('selected')),true);
   let custom=await getColors();assert.ok(contrast(rgb(custom.navText),rgb(custom.navBg))>=4.5);assert.ok(contrast(rgb(custom.fab),rgb(custom.fabColor))>=4.5);
   for(const hex of ['#000000','#ffffff','#ffff00']){await page.locator('#customAccent').evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))},hex);await page.waitForTimeout(250);custom=await getColors();assert.ok(contrast(rgb(custom.navText),rgb(custom.navBg))>=4.5);assert.ok(contrast(rgb(custom.fab),rgb(custom.fabColor))>=4.5);}
   assert.match(await page.locator('#accentSettingHint').innerText(),/Custom accent selected/i);
   await page.locator('.accent-dot[data-accent="blue"]').click();await page.locator('#useCustomAccent').click();assert.equal(await page.evaluate(()=>appSettings.appearance.accent),'custom');assert.equal(await page.locator('#useCustomAccent').getAttribute('aria-pressed'),'true');
   await page.reload();await page.locator('#authOfflineBtn').click();await page.waitForFunction(()=>window.trackerReady);await page.evaluate(()=>{if(typeof closePondoAbout==='function')closePondoAbout();openSettings();switchSettingsTab('appearance')});assert.equal(await page.locator('#customAccent').inputValue(),'#ffff00');assert.equal(await page.locator('.custom-accent-label').evaluate(e=>e.classList.contains('selected')),true);
   // No-fund fallback remains visibly selected, then the first displayed fund color takes over.
   await page.evaluate(()=>toggleSetting('appearance','dynamicAccent'));assert.match(await page.locator('#accentSettingHint').innerText(),/No funds yet/i);assert.equal(await page.locator('.custom-accent-label').evaluate(e=>e.classList.contains('selected')),true);
   await page.evaluate(()=>toggleSetting('appearance','dynamicAccent'));
   // First fund's visible rotation, not its stale stored color; selecting a swatch turns it off.
   await page.evaluate(()=>{funds=[{id:'f',name:'First',initialAmount:100,dateReceived:localDate(),color:'rose'}];toggleSetting('appearance','dynamicAccent')});assert.match(await page.locator('#accentSettingHint').innerText(),/first fund/i);assert.equal(await page.locator('#toggle-dynamicAccent').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim()),await page.evaluate(()=>readableAccent(fundCardColor(funds[0]).hex)));assert.equal(await swatches.filter({hasText:'✓'}).count(),0);
   await page.locator('.accent-dot[data-accent="blue"]').click();assert.equal(await page.locator('#toggle-dynamicAccent').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.accent-dot[data-accent="blue"]').getAttribute('aria-pressed'),'true');
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Accent presets, custom, dynamic, contrast, keyboard and persistence passed on phone, tablet and desktop.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
