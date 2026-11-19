/*
 * Optional real-browser PDF regression (synthetic data; no Firebase access).
 * Requires playwright-core, pypdf and a Chromium executable. See
 * docs/contribution-print-pagination.md for an isolated installation example.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const pdfText=String.raw`
import json, sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
print(json.dumps([page.extract_text() or '' for page in reader.pages]))
`;
function parsePdf(file){const run=spawnSync('python3',['-c',pdfText,file],{encoding:'utf8'});if(run.status!==0)throw new Error('pypdf failed: '+run.stderr);return JSON.parse(run.stdout);}
function checkMarker(text,prefix,count){for(let i=1;i<=count;i++){let marker=prefix+String(i).padStart(3,'0');assert.equal(text.split(marker).length-1,1,'Expected exactly one '+marker);}}
async function main(){
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,name||'index.html');
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}const ext=path.extname(file),mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'}[ext];if(mime)res.setHeader('Content-Type',mime);res.end(data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,dir=fs.mkdtempSync(path.join(os.tmpdir(),'pondo-print-'));
 try{
  let executablePath=process.env.CHROMIUM_PATH,args=[];
  if(!executablePath){const chrome=require('@sparticuz/chromium').default;executablePath=await chrome.executablePath();args=chrome.args;}
  browser=await chromium.launch({executablePath,args,headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('https://www.gstatic.com/firebasejs/**',route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof printContribution==='function');
  await page.evaluate(()=>{document.getElementById('authGate').style.display='none';document.getElementById('pondoApp').inert=false;window.print=()=>{};});
  async function pdf(name){await page.emulateMedia({media:'print'});const layout=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).overflow,body:getComputedStyle(document.body).overflow,report:getComputedStyle(document.getElementById('contributionPrint')).position}));assert.equal(layout.root,'visible');assert.equal(layout.body,'visible');assert.equal(layout.report,'static');const file=path.join(dir,name+'.pdf');await page.pdf({path:file,format:'A4',printBackground:true,preferCSSPageSize:true});await page.emulateMedia({media:'screen'});const pages=parsePdf(file);await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));return pages;}
  async function detailed(count,paid,width,dark){
   await page.setViewportSize({width,height:900});
   await page.evaluate(({count,paid,dark})=>{
    document.body.classList.toggle('dark-mode',dark);org.name='Regression Organization';sigs=[{name:'Signer Last',title:'Treasurer'}];projects=[];funds=[];txs=[];
    contributionActivities=[{id:'a',title:'Contribution Test',description:'Synthetic detail',amount:350}];
    contributors=Array.from({length:count},(_,i)=>({id:'p'+i,activityId:'a',name:'PersonMarker'+String(i+1).padStart(3,'0'),expected:350}));
    contributionPayments=Array.from({length:paid},(_,i)=>({id:'m'+i,contributorId:'p'+i,date:'2026-01-01',amount:350,method:'personal',receivedBy:'Recorder',reference:'PaymentMarker'+String(i+1).padStart(3,'0')}));
    openContributionDetails('a');document.querySelector('.contrib-reports').open=true;document.querySelector('.contrib-print').click();
    if(!document.body.classList.contains('modal-open')||!document.body.classList.contains('contribution-printing'))throw Error('Print did not start from the activity dialog');
   },{count,paid,dark});
   const pages=await pdf('detail-'+count+'-'+width),text=pages.join('\n');
   const parts=text.split('Payment history');assert.equal(parts.length,2,'Payment history heading must appear once');
   checkMarker(parts[0],'PersonMarker',count);checkMarker(parts[1],'PaymentMarker',paid);checkMarker(parts[1],'PersonMarker',paid);
   for(const part of pages){if(part.includes('PersonMarker')&&!part.includes('PaymentMarker'))assert.ok(part.includes('EXPECTED PAID BALANCE STATUS'),'Contributor table header missing');if(part.includes('PaymentMarker'))assert.ok(part.includes('DATE CONTRIBUTOR AMOUNT'),'Payment table header missing');}
   if(count===25){for(const total of ['₱8,750','₱4,900','₱3,850'])assert.ok(text.includes(total),'Missing summary total '+total);}
   assert.ok(text.includes('Signer Last'));assert.ok(text.includes('Financial summary'));assert.ok(!text.includes('Track and manage your funds'));
   if(count>20)assert.ok(pages.length>1,'Long reports must span pages');
   else assert.equal(pages.length,1,'Small report should fit on one page');
   const after=await page.evaluate(()=>({modal:document.body.classList.contains('modal-open'),printing:document.body.classList.contains('contribution-printing')}));assert.equal(after.modal,true);assert.equal(after.printing,false);
   console.log('detailed:',count,'contributors,',paid,'payments,',pages.length,'pages,',width,'px');
  }
  await detailed(25,14,1280,false);await detailed(80,80,320,true);await detailed(1,1,390,false);
  await page.evaluate(()=>{contributionActivities=Array.from({length:80},(_,i)=>({id:'act'+i,title:'ActivityMarker'+String(i+1).padStart(3,'0'),amount:350}));contributors=[];contributionPayments=[];document.body.classList.add('modal-open');printContributionWorkspaceSummary();});
  let pages=await pdf('workspace');assert.ok(pages.length>1);checkMarker(pages.join('\n'),'ActivityMarker',80);assert.ok(!pages.join('\n').includes('PersonMarker'));assert.ok(pages.join('\n').includes('Signer Last'));console.log('workspace summary: 80 activities,',pages.length,'pages');
  await page.evaluate(()=>{contributionActivities=[{id:'death',deathAid:{version:1,subject:'Aid test',payments:Array.from({length:60},(_,i)=>({id:'x'+i,memberId:'m'+i,name:'AidMarker'+String(i+1).padStart(3,'0'),position:'Staff',amount:100,date:'2026-01-01',source:'personal'}))}}];document.body.classList.add('modal-open');printDeathAidIndividual('death');});
  pages=await pdf('death-aid');assert.ok(pages.length>1);checkMarker(pages.join('\n'),'AidMarker',60);assert.ok(pages.join('\n').includes('Collected by'));assert.ok(pages.join('\n').includes('Received by'));console.log('Death Aid: 60 members,',pages.length,'pages');
  // The combined draft uses the sample's deceased-by-member matrix, with
  // accurate totals and no implied handover; printing must not mutate records.
  await page.evaluate(()=>{org.name='Receipt School';org.location='Test location';contributionActivities=['Adelfa','Hilda','Lolita'].map((subject,j)=>({id:'act'+j,deathAid:{version:1,subject,details:'Family of member',date:'2026-01-01',payments:Array.from({length:8},(_,i)=>({id:'p'+j+'-'+i,memberId:'m'+i,name:'Member '+(i+1),position:'Teacher',amount:j?50:100,date:'2026-01-01',source:j===1?'fund':'personal',method:'Cash',collectedBy:'Officer'}))}}));const d=contributionActivities[0].deathAid;d.payments[0].amount=60;d.payments.push({...d.payments[0],id:'installment',amount:40});const rows=contributionActivities.flatMap(activity=>activity.deathAid.payments.map(payment=>({activity,payment})));printDeathAidMatrix(rows,{date:'Not specified',receiver:'',role:''},true);});
  pages=await pdf('death-aid-combined-draft');assert.equal(pages.length,1,'A three-person, eight-member acknowledgment should fit on A4');const bulk=pages[0];for(const text of ['Acknowledgment Receipt','DRAFT','Adelfa','Hilda','Lolita','Member 1','Member 8','₱800','₱400','₱1,600','Collected by','Officer','Received by','Proposed received date'])assert.ok(bulk.includes(text),text);assert.equal(await page.evaluate(()=>contributionActivities.some(a=>a.deathAid.payments.some(p=>p.remittance))),false);
  await page.evaluate(()=>{const activity=contributionActivities[0];activity.deathAid.payments.forEach((p,i)=>p.remittance={id:'remit',date:'2026-01-02',receiver:'Receiving Officer',role:'Treasurer'});printDeathAidRemittance('remit');});pages=await pdf('death-aid-recorded');assert.match(pages.join('\n'),/Recorded received date/);assert.match(pages.join('\n'),/Receiving Officer/);assert.match(pages.join('\n'),/Collected by/);assert.match(pages.join('\n'),/Treasurer/);assert.ok(!pages.join('\n').includes('DRAFT'));
  // Multiple and missing collector values remain visible on paper without assigning the whole batch to one signer.
  await page.evaluate(()=>{const p=contributionActivities[1].deathAid.payments;p[0].collectedBy='CollectorMarkerOne';p[1].collectedBy='CollectorMarkerTwo';p[2].collectedBy='';const rows=p.slice(0,3).map(payment=>({activity:contributionActivities[1],payment}));printDeathAidMatrix(rows,{date:'',receiver:'',role:''},true)});pages=await pdf('death-aid-mixed-collectors');const mixed=pages.join('\n');for(const marker of ['CollectorMarkerOne','CollectorMarkerTwo','Collector not specified','Collected by','Received by','₱150'])assert.ok(mixed.includes(marker),marker);
  // Four records split into two tables; long rosters must retain every member
  // in each table and keep the grand total across all four records.
  await page.evaluate(()=>{contributionActivities=Array.from({length:4},(_,j)=>({id:'wide'+j,deathAid:{version:1,subject:'DeceasedMarker'+j,details:'',payments:Array.from({length:80},(_,i)=>({id:'w'+j+'-'+i,memberId:'w'+i,name:'BulkMarker'+String(i+1).padStart(3,'0'),position:'',amount:100,date:'2026-01-01',source:'personal'}))}}));const rows=contributionActivities.flatMap(activity=>activity.deathAid.payments.map(payment=>({activity,payment})));printDeathAidMatrix(rows,{date:'Not specified',receiver:'',role:''},true);});pages=await pdf('death-aid-combined-wide');assert.ok(pages.length>1);let wide=pages.join('\n');for(let i=1;i<=80;i++){const marker='BulkMarker'+String(i).padStart(3,'0');assert.equal(wide.split(marker).length-1,2,marker)}assert.ok(wide.includes('₱32,000'));assert.equal(wide.split('TOTAL CONTRIBUTIONS').length-1,2);
  // Individual acknowledgments print two complete, signed copies in the two
  // halves of one A4 page, even when launched from a mobile/dark workspace.
  await page.evaluate(()=>{org.name='Receipt School';org.location='Test location';contributionActivities=[{id:'receipt',deathAid:{version:1,subject:'Deceased Person',details:'Family',payments:[{id:'ReceiptMarker001',memberId:'m',name:'Paying Member',position:'Teacher',amount:50,date:'2026-01-01',source:'personal',method:'Cash',collectedBy:'Receiving Officer'}]}}];printDeathAidPaymentReceipt('receipt','ReceiptMarker001');});
  await page.emulateMedia({media:'print'});const copies=await page.locator('.death-receipt-copy').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,height:n.getBoundingClientRect().height})));assert.equal(copies.length,2);assert.ok(Math.abs(copies[1].top-copies[0].top-134*96/25.4)<2);await page.emulateMedia({media:'screen'});
  pages=await pdf('death-aid-receipt');assert.equal(pages.length,1,'Two normal receipt copies should fit on one A4 page');let receipt=pages[0];for(const text of ['PAYING MEMBER COPY','RECORDS COPY','Paying Member','Receiving Officer','Received by','Member / payee','ReceiptMarker001'])assert.ok(receipt.includes(text),text);assert.equal(receipt.split('ReceiptMarker001').length-1,2);assert.ok(!receipt.includes('BaPSTEA representative'));assert.ok(!receipt.includes('Collected by'));
  await page.evaluate(()=>{org.logoData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4fQAAAAASUVORK5CYII=';printDeathAidPaymentReceipt('receipt','ReceiptMarker001');});assert.equal(await page.locator('.death-receipt-copy .death-letterhead img').count(),2);pages=await pdf('death-aid-receipt-logo');assert.equal(pages.length,1,'Receipts with an organization logo should also fit on one A4 page');await page.evaluate(()=>org.logoData='');
  // Large valid fields are allowed to spill over rather than overlap or vanish.
  await page.evaluate(()=>{const long='WWWW '.repeat(32);const d=contributionActivities[0].deathAid;d.subject=long;d.details='DETAILS '.repeat(37);Object.assign(d.payments[0],{name:long,position:long,method:long,collectedBy:long});printDeathAidPaymentReceipt('receipt','ReceiptMarker001');});
  pages=await pdf('death-aid-receipt-long');receipt=pages.join('\n');assert.equal(receipt.split('ReceiptMarker001').length-1,2);assert.equal(receipt.split('Member / payee').length-1,2);assert.equal(receipt.split('DETAILS').length-1,74,'Both full descriptions must remain visible');assert.equal(receipt.split('WWWW').length-1,384,'Both copies must retain all long fields and signatory names');assert.ok(receipt.includes('PAYING MEMBER COPY')&&receipt.includes('RECORDS COPY'));console.log('Death Aid receipts: A4 copies and long fields passed');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(err=>{console.error(err);process.exitCode=1});
