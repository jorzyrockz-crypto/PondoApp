/* Synthetic browser test of the isolated recovery UI and adapter.
 * Fake memory records do not test Firestore rules or production Firebase. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="recovery"></main>');
  await page.addStyleTag({path:path.join(__dirname,'..','faculty-fund-spark-recovery.css')});
  for(const file of ['faculty-fund-spark-recovery.js','faculty-fund-spark-recovery-ui.js'])await page.addScriptTag({path:path.join(__dirname,'..',file)});
  await page.evaluate(()=>{
   const d=new Date('2025-01-01T00:00:00.000Z');window.ctx={orgId:'school',uid:'ao',role:'disbursing',memberConfirmed:true,scopeToken:1};
   const rem='rem_'+('a'.repeat(32)),exp='exp_'+('b'.repeat(32));window.ids={rem,exp};window.state={revision:1,records:{remittances:[{id:rem,status:'draft',createdBy:'ao',createdAt:d,amountCents:25000,count:1,paymentIds:['p1','p2']}],payments:[{id:'p1',memberName:'Teacher <script>bad</script>',absenceDate:'2024-01-01',amountCents:25000,remittanceId:rem},{id:'p2',memberName:'Second teacher',absenceDate:'2024-01-02',amountCents:25000,remittanceId:null}],expenses:[{id:exp,status:'draft',createdBy:'ao',createdAt:d,occurredAt:d,amountCents:25000,allocatedCents:10000,description:'Supplies',payee:'Shop',reference:'OR-1'}],allocations:[{id:'allocation',expenseId:exp,released:false}]}};
   window.calls=[];window.ask=async()=> 'Duplicate';window.confirm=async()=>true;window.lossResume=true;window.lossCancel=true;
   const client=()=>({cancelExpense:async(id,reason)=>{window.calls.push(['cancel',id,reason]);const e=state.records.expenses.find(x=>x.id===id);e.status='cancelling';e.cancelReason=reason;state.revision++;if(window.lossCancel){window.lossCancel=false;throw Error('lost response')}},inspectExpense:async id=>({status:state.records.expenses.find(x=>x.id===id).status,allocations:state.records.allocations.filter(x=>x.expenseId===id)}),release:async id=>{state.records.allocations.find(x=>x.id===id).released=true;state.records.expenses[0].allocatedCents=0;state.revision++},finishCancellation:async id=>{state.records.expenses.find(x=>x.id===id).status='cancelled';state.revision++}});
   window.recovery=createFacultyFundSparkRecovery({getContext:()=>ctx,makeReader:()=>({read:async()=>structuredClone(state)}),makeClient:client,makeWriteAdapter:()=>({transition:async input=>{window.calls.push(['resume',input]);state.records.remittances[0].status='pending';state.records.remittances[0].count=2;state.records.payments[1].remittanceId=rem;state.revision++;if(window.lossResume){window.lossResume=false;throw Error('lost response')}return {ok:true}}})});
   window.screen=createFacultyFundSparkRecoveryUI({root:document.getElementById('recovery'),getContext:()=>ctx,makeRecovery:()=>recovery,askReason:m=>window.ask(m),confirmAction:m=>window.confirm(m)});
  });
  await page.evaluate(()=>screen.refresh());
  assert.equal(await page.locator('#recovery script').count(),0);assert.match(await page.locator('#recovery').innerText(),/Teacher <script>bad<\/script>/);assert.match(await page.locator('#recovery').innerText(),/Linked payments: 1 of 2/);assert.match(await page.locator('#recovery').innerText(),/Currently reserved: ₱100.00/);
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});const size=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(size.width<=size.viewport+1,JSON.stringify(size));}
  const ids=await page.evaluate(()=>ids);await page.locator(`[data-recovery-id="${ids.rem}"] [data-recovery-action=resume]`).click();await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('result is unconfirmed'));
  assert.equal(await page.locator('[data-recovery-id]').count(),0);await page.locator('[data-recovery-action=refresh]').click();await page.waitForSelector(`[data-recovery-id="${ids.exp}"]`);assert.equal(await page.locator(`[data-recovery-id="${ids.rem}"]`).count(),0);assert.match(await page.locator('#recovery').innerText(),/Check transaction and remittance history/);
  await page.locator(`[data-recovery-id="${ids.exp}"] [data-recovery-action=cancel]`).click();await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('result is unconfirmed'));assert.equal(await page.evaluate(()=>state.records.expenses[0].status),'cancelling');
  await page.locator('[data-recovery-action=refresh]').click();await page.waitForSelector(`[data-recovery-id="${ids.exp}"] [data-recovery-action=finish]`);await page.locator(`[data-recovery-id="${ids.exp}"] [data-recovery-action=finish]`).click();await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('Cancelled;'));assert.equal(await page.evaluate(()=>state.records.expenses[0].status),'cancelled');assert.equal(await page.evaluate(()=>state.records.allocations[0].released),true);
  // A confirmed accepted outcome must never be described as a cancellation.
  await page.evaluate(()=>{const e=state.records.expenses[0];e.status='draft';e.allocatedCents=0;window.recovery={list:async()=>({items:[{kind:'expense',id:e.id,status:'draft',createdBy:'ao',createdAt:e.createdAt,amountCents:25000,remaining:true,canResume:true,description:'Supplies',payee:'Shop',reference:'',occurredAt:e.occurredAt,allocatedCents:0}]}),resolve:async input=>({kind:input.kind,id:input.id,status:'recorded',remaining:false,revision:5})};});
  await page.evaluate(()=>screen.refresh());await page.locator(`[data-recovery-id="${ids.exp}"] [data-recovery-action=cancel]`).click();await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('Already recorded'));assert.match(await page.locator('[role=status]').innerText(),/not cancelled/);
  // Switch while an asynchronous confirmation is open: no old-workspace write.
  await page.evaluate(()=>{window.confirm=()=>new Promise(r=>window.confirmResolve=r);window.recovery.resolve=async()=>{window.calls.push(['unexpected']);throw Error('should not run')};});
  await page.locator(`[data-recovery-id="${ids.exp}"] [data-recovery-action=resume]`).click();await page.waitForFunction(()=>typeof window.confirmResolve==='function');
  await page.evaluate(()=>{ctx={...ctx,orgId:'other',scopeToken:2};screen.reset();window.confirmResolve(true)});await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>calls.some(x=>x[0]==='unexpected')),false);assert.doesNotMatch(await page.locator('#recovery').innerText(),/Supplies/);
  // A late list cannot leak a former workspace after reset.
  await page.evaluate(()=>{ctx={...ctx,orgId:'school',scopeToken:3};window.recovery={list:()=>new Promise(r=>window.listResolve=r)};screen.refresh();});await page.waitForFunction(()=>typeof window.listResolve==='function');await page.evaluate(()=>{ctx={...ctx,orgId:'other',scopeToken:4};screen.reset();window.listResolve({items:[{kind:'expense',description:'Private old workspace'}]})});await page.waitForTimeout(30);assert.doesNotMatch(await page.locator('#recovery').innerText(),/Private old workspace/);
  await page.evaluate(()=>{ctx={...ctx,role:'reviewer',scopeToken:5};screen.reset();screen.refresh()});assert.match(await page.locator('[role=status]').innerText(),/authorized/);
  assert.deepEqual(errors,[]);console.log('Isolated recovery UI: lost responses, cancelled allocations, confirmed outcomes, XSS and workspace switches passed.');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
