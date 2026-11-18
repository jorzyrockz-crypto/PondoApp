/* EXPERIMENTAL pending-token reconciliation. Not connected to the live app.
 * Requires the versioned, server-only reader and its matching rules. A missing
 * document is never proof that an earlier request cannot still arrive. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function createPendingInspector({getContext,makeReader}){
  if(typeof getContext!=='function'||typeof makeReader!=='function')fail('Invalid pending inspector setup');
  const valid=c=>!!c&&c.memberConfirmed===true&&typeof c.uid==='string'&&!!c.uid&&typeof c.orgId==='string'&&!!c.orgId&&['owner','disbursing'].includes(c.role)&&['string','number'].includes(typeof c.scopeToken);
  function current(old){const c=getContext();return valid(c)&&c.uid===old.uid&&c.orgId===old.orgId&&c.role===old.role&&c.scopeToken===old.scopeToken;}
  function time(v){const n=v instanceof Date?v.getTime():typeof v?.toMillis==='function'?v.toMillis():NaN;return Number.isFinite(n)?n:NaN;}
  async function inspect(input){
   const now=getContext();if(!valid(now)||now.orgId!==input?.orgId)fail('Open the original authorized workspace');const c={...now};
   if(typeof input.requestId!=='string'||!/^[a-f0-9]{32}$/.test(input.requestId)||!['submitRemittance','recordExpense'].includes(input.operation))fail('Invalid pending request');
   if(input.operation==='submitRemittance'&&(!Array.isArray(input.paymentIds)||!input.paymentIds.length||input.paymentIds.length>200||input.paymentIds.some(x=>typeof x!=='string'||!x)||new Set(input.paymentIds).size!==input.paymentIds.length))fail('Invalid pending remittance');
   if(input.operation==='recordExpense'&&(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||typeof input.description!=='string'||typeof input.payee!=='string'||typeof(input.reference??'')!=='string'||typeof input.occurredAt!=='string'||!Number.isFinite(Date.parse(input.occurredAt))||new Date(input.occurredAt).toISOString()!==input.occurredAt))fail('Invalid pending expense');
   const reader=makeReader(c,()=>current(c));if(!reader?.read)fail('Server reconciliation is unavailable');const s=await reader.read(input);if(!current(c))fail('Workspace changed during reconciliation');
   if(!Number.isSafeInteger(s?.revision)||!s.records)fail('Invalid server reconciliation');
   const isRem=input.operation==='submitRemittance',id=(isRem?'rem_':'exp_')+input.requestId,rows=isRem?s.records.remittances:s.records.expenses;if(!Array.isArray(rows)||!Array.isArray(s.records.payments))fail('Invalid server records');
   const found=rows.filter(x=>x.id===id);if(found.length>1)fail('Duplicate server records');if(!found.length)return {status:'unconfirmed',clearable:false,revision:s.revision};const item=found[0];
   if(item.createdBy!==c.uid)fail('Pending request actor does not match server record');
   if(isRem){
    if(!Array.isArray(item.paymentIds)||JSON.stringify(item.paymentIds)!==JSON.stringify(input.paymentIds))fail('Pending request does not match server remittance');
    if(!['draft','pending','accepted','declined','cancelled','voided'].includes(item.status))fail('Invalid remittance status');
    const attached=s.records.payments.some(p=>p.remittanceId===id),cleanup=['declined','cancelled','voided'].includes(item.status)&&attached;
    return {status:item.status,clearable:item.status!=='draft'&&!cleanup,needsRecovery:item.status==='draft'||cleanup,revision:s.revision};
   }
   if(item.amountCents!==input.amountCents||item.description!==input.description||item.payee!==input.payee||(item.reference??'')!==(input.reference??'')||time(item.occurredAt)!==Date.parse(input.occurredAt))fail('Pending request does not match server expense');
   if(!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(item.status))fail('Invalid expense status');
   return {status:item.status,clearable:['recorded','cancelled','voided'].includes(item.status),needsRecovery:['draft','cancelling','voiding'].includes(item.status),revision:s.revision};
  }
  return {inspect};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkPendingInspector:createPendingInspector};else global.createFacultyFundSparkPendingInspector=createPendingInspector;
})(typeof window!=='undefined'?window:globalThis);
