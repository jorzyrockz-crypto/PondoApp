/* Experimental cross-device recovery. Not loaded by the app or production rules.
 * Uses a revision-checked server reader. The rules, not this module, authorize
 * all mutations; a listing is not a lock and every action may race. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function createRecovery({getContext,makeReader,makeClient,makeWriteAdapter}){
  if([getContext,makeReader,makeClient,makeWriteAdapter].some(x=>typeof x!=='function'))fail('Invalid recovery setup');
  function context(orgId){const c=getContext();if(!c||c.memberConfirmed!==true||typeof c.uid!=='string'||!c.uid||typeof c.orgId!=='string'||!c.orgId||c.orgId!==orgId||!['owner','disbursing'].includes(c.role)||!['string','number'].includes(typeof c.scopeToken))fail('Open an authorized team workspace');return {...c};}
  function current(old){const c=getContext();return !!c&&c.memberConfirmed===true&&c.uid===old.uid&&c.orgId===old.orgId&&c.role===old.role&&c.scopeToken===old.scopeToken;}
  function guard(c){if(!current(c))fail('Workspace changed; retry in the original workspace');}
  async function step(c,fn){guard(c);const result=await fn();guard(c);return result;}
  async function load(c){return step(c,()=>makeReader(c,()=>current(c)).read());}
  function selected(snapshot,kind,id){const rows=kind==='remittance'?snapshot.records.remittances:kind==='expense'?snapshot.records.expenses:null;if(!rows||typeof id!=='string'||!id||id.length>128)fail('Invalid recovery selection');const item=rows.find(x=>x.id===id);if(!item)fail('Record not found; refresh recovery');return item;}
  function remaining(snapshot,kind,item){
   if(kind==='remittance')return item.status==='draft'||(['cancelled','declined','voided'].includes(item.status)&&snapshot.records.payments.some(p=>p.remittanceId===item.id));
   return ['draft','cancelling','voiding'].includes(item.status);
  }
  function token(kind,id){const m=(kind==='remittance'?/^rem_([a-f0-9]{32})$/:/^exp_([a-f0-9]{32})$/).exec(id);return m?m[1]:null;}
  function display(snapshot,c,kind,item){
   const base={kind,id:item.id,status:item.status,createdBy:item.createdBy,createdAt:asISO(item.createdAt),amountCents:item.amountCents,remaining:true,canResume:item.status==='draft'&&item.createdBy===c.uid&&!!token(kind,item.id)};
   if(kind==='expense')return {...base,description:item.description,payee:item.payee,reference:item.reference??'',occurredAt:asISO(item.occurredAt),allocatedCents:item.allocatedCents};
   const payments=new Map(snapshot.records.payments.map(p=>[p.id,p]));return {...base,linkedCount:item.count,payments:item.paymentIds.map(id=>{const p=payments.get(id);return p?{id,memberName:p.memberName,absenceDate:p.absenceDate,amountCents:p.amountCents,linked:p.remittanceId===item.id}:{id,missing:true};})};
  }
  async function list(input){const c=context(input?.orgId),s=await load(c),items=[];for(const r of s.records.remittances)if(remaining(s,'remittance',r))items.push(display(s,c,'remittance',r));for(const e of s.records.expenses)if(remaining(s,'expense',e))items.push(display(s,c,'expense',e));guard(c);return {revision:s.revision,items};}
  function asISO(value){const ms=value instanceof Date?value.getTime():typeof value?.toMillis==='function'?value.toMillis():NaN;if(!Number.isFinite(ms))fail('Invalid expense time');return new Date(ms).toISOString();}
  function original(c,kind,item){const requestId=token(kind,item.id);if(!requestId||item.createdBy!==c.uid)fail('Only the original collector can resume this draft; cancel it instead');return kind==='remittance'?{orgId:c.orgId,requestId,operation:'submitRemittance',paymentIds:[...item.paymentIds]}:{orgId:c.orgId,requestId,operation:'recordExpense',amountCents:item.amountCents,description:item.description,payee:item.payee,reference:item.reference??'',occurredAt:asISO(item.occurredAt)};}
  async function releaseRemittance(c,client,s,item){for(const p of s.records.payments)if(p.remittanceId===item.id)await step(c,()=>client.releasePayment(item.id,p.id));}
  async function releaseExpense(c,client,id,mode){const view=await step(c,()=>client.inspectExpense(id));if(view.status===(mode==='cancel'?'cancelled':'voided'))return;if(view.status!==(mode==='cancel'?'cancelling':'voiding'))fail('Expense changed; refresh recovery');for(const line of view.allocations)if(!line.released)await step(c,()=>client.release(line.id));await step(c,()=>mode==='cancel'?client.finishCancellation(id):client.finishVoid(id));}
  async function resolve(input){
   const c=context(input?.orgId),kind=input?.kind,action=input?.action;if(!['remittance','expense'].includes(kind)||!['resume','cancel','finish'].includes(action))fail('Invalid recovery action');
   let s=await load(c),item=selected(s,kind,input.id);const client=makeClient(c);if(!client)fail('Faculty Fund is unavailable');guard(c);
   if(action==='resume'){
    if(item.status==='draft'){const write=makeWriteAdapter(c);if(!write?.transition)fail('Resume is unavailable');await step(c,()=>write.transition(original(c,kind,item)));}
    // If a previous attempt already finished, report the authoritative status
    // below; never claim that a cancelled request was submitted or recorded.
   }else if(action==='cancel'){
    if(item.status==='draft'||kind==='remittance'&&item.status==='pending'){
     if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>500)fail('A cancellation reason is required');const reason=input.reason.trim();
     if(kind==='remittance')await step(c,()=>client.cancelRemittance(item.id,reason));else await step(c,()=>client.cancelExpense(item.id,reason));
     s=await load(c);item=selected(s,kind,item.id);
    }
    if(kind==='remittance'&&['cancelled','declined','voided'].includes(item.status))await releaseRemittance(c,client,s,item);
    if(kind==='expense'&&item.status==='cancelling')await releaseExpense(c,client,item.id,'cancel');
   }else{
    if(kind==='remittance'&&['cancelled','declined','voided'].includes(item.status))await releaseRemittance(c,client,s,item);
    else if(kind==='expense'&&item.status==='cancelling')await releaseExpense(c,client,item.id,'cancel');
    else if(kind==='expense'&&item.status==='voiding')await releaseExpense(c,client,item.id,'void');
    else if(remaining(s,kind,item))fail('Choose resume or cancel for a draft');
   }
   s=await load(c);item=selected(s,kind,input.id);guard(c);return {kind,id:item.id,status:item.status,remaining:remaining(s,kind,item),revision:s.revision};
  }
  return {list,resolve};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkRecovery:createRecovery};else global.createFacultyFundSparkRecovery=createRecovery;
})(typeof window!=='undefined'?window:globalThis);
