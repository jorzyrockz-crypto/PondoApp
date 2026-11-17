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
  pages=await pdf('death-aid');assert.ok(pages.length>1);checkMarker(pages.join('\n'),'AidMarker',60);assert.ok(pages.join('\n').includes('Signatories'));console.log('Death Aid: 60 members,',pages.length,'pages');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(err=>{console.error(err);process.exitCode=1});
