'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright-core');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{
  const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/, '')||'index.html');
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript'})[path.extname(file)]||'application/octet-stream');res.end(data)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.locator('#authOfflineBtn').click();await page.waitForFunction(()=>window.trackerReady);
  await page.evaluate(()=>{if(typeof closePondoAbout==='function')closePondoAbout();appSettings.motion.reduceMotion=true;window.pondoGuestMode=false;window.pondoCurrentUser={uid:'u'};window.pondoTeamState={orgId:'team',uid:'u',role:'owner',memberConfirmed:true,baselineReady:true,lastSyncedJSON:'{}',members:[{uid:'u',displayName:'Member'}]};window.beforePurposeTest=JSON.stringify(currentSnapshot());openQuickAction()});
  await context.setOffline(true);
  const input=page.locator('#quickActionQuery'),suggestion=page.locator('#quickActionList button').first();
  const examples=[
   ['organize money into separate funding sources','Add a fund'],
   ['plan an initiative and its expenses','Add a project'],
   ['set up member dues for a fundraising drive','Create a contribution activity'],
   ['log money coming into a regular fund','Record income'],
   ['log purchases already paid from a fund','Record an expense'],
   ['track an invoice from a supplier that has not been paid','Record an unpaid supplier bill'],
   ['pay back a member who spent their own money','Request or record a refund'],
   ['log gifts of money from a donor','Record a cash donation'],
   ['log a member dues payment for an activity','Record a contribution payment'],
   ['log teacher leave absence payments in a separate register','Record an Other Funds payment'],
   ['help the family of a deceased person with funeral assistance','Find or create a Death Aid record'],
   ['check how much cash the workspace has left','View workspace fund balance'],
   ['review a person contribution and payment history','Review individual account records'],
   ['print a summary of money in and out of funds','Print a cash financial report'],
   ['print a person contribution and payment history','Print an individual account statement'],
   ['where can i find a form to PAY BACK A MEMBER WHO SPENT THEIR OWN MONEY please','Request or record a refund'],
   ['how can i track money spent on supplies','Record an expense'],
   ['hindi pa nababayarang invoice ng supplier','Record an unpaid supplier bill'],
   ['tulong sa pamilya ng namatay','Find or create a Death Aid record'],
   ['record incme','Record income']
  ];
  for(const [text,title] of examples){await input.fill(text);assert.equal(await suggestion.locator('strong').innerText(),title,text)}
  await input.fill('member has not paid contributions');assert.equal(await suggestion.locator('strong').innerText(),'Record a contribution payment');assert.equal(await page.getByRole('button',{name:/Record an unpaid supplier bill/}).count(),0);
  await input.fill('I paid a bill');assert.equal(await page.getByRole('button',{name:/Record an unpaid supplier bill/}).count(),0);
  await input.fill('unpaid purchase');assert.equal(await page.getByRole('button',{name:/Record an expense/}).count(),0);
  await input.fill('track a secret spacecraft');assert.match(await suggestion.innerText(),/No matching action.*separate Other Funds/);
  assert.equal(await page.evaluate(()=>JSON.stringify(currentSnapshot())===beforePurposeTest),true);
  await input.fill('track an invoice from a supplier that has not been paid');await suggestion.click();await page.locator('#invoiceForm').waitFor({state:'visible'});assert.equal(await page.locator('#payableModal').getAttribute('data-mode'),'invoice');assert.equal(await page.evaluate(()=>JSON.stringify(currentSnapshot())===beforePurposeTest),true);await page.evaluate(()=>closePayableModal());
  await page.evaluate(()=>{window.pondoTeamState={orgId:'team',uid:'u',role:'reviewer',memberConfirmed:true,baselineReady:true,lastSyncedJSON:'{}',members:[{uid:'u',displayName:'Member'}]};openQuickAction()});
  await input.fill('log money coming into a regular fund');assert.equal(await page.locator('#quickActionList button').count(),0);
  await input.fill('check how much cash the workspace has left');assert.equal(await suggestion.locator('strong').innerText(),'View workspace fund balance');
  await input.fill('totally unrecognized zebras');assert.equal(await page.locator('#quickActionList button').count(),0);
  await page.keyboard.press('Escape');await page.locator('#quickActionOverlay').waitFor({state:'hidden'});
  await page.evaluate(()=>{window.pondoTeamState={orgId:'team',uid:'u',role:'owner',memberConfirmed:true,baselineReady:true,lastSyncedJSON:'{}',members:[{uid:'u',displayName:'Member'}]};openQuickAction()});
  await input.fill('log money coming into a regular fund');
  await page.evaluate(()=>{window.pondoTeamState.role='reviewer';document.querySelector('#quickActionList button').click()});
  assert.equal(await page.locator('#quickActionOverlay').isVisible(),true);assert.match(await page.locator('#quickActionStatus').innerText(),/access changed/i);assert.equal(await page.locator('#fabForm-tx').isVisible(),false);
  assert.deepEqual(errors,[]);await context.close();console.log('Offline Quick Action purpose, permissions and safe route coverage passed.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
