/* EXPERIMENTAL bounded reader for one pending request, not app integration.
 * It is NOT a general ledger, balance, audit, receipt or report reader. It
 * relies on the matching versioned rules protecting plan/link invariants and
 * advancing the revision on every relevant write. Admin writes bypass them. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function createPendingReader({db,api,orgId,isCurrent,trackRemittanceReleases=false}){
  if(!db||!api||typeof orgId!=='string'||!orgId||orgId.includes('/')||typeof isCurrent!=='function'||typeof trackRemittanceReleases!=='boolean'||typeof api.doc!=='function'||typeof api.getDocFromServer!=='function')fail('Invalid pending reader setup');
  const nameOf=name=>trackRemittanceReleases?name.replace(/^spark/,'sparkDiscovery'):name,ref=(name,id)=>api.doc(db,`organizations/${orgId}/${nameOf(name)}/${id}`),current=()=>{if(!isCurrent())fail('Workspace changed while reconciling');};
  function stable(s){if(!s?.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Pending data is not server-confirmed');}
  function marker(s){stable(s);if(!s.exists())return 0;const n=s.data().revision;if(!Number.isSafeInteger(n)||n<1)fail('Invalid Faculty Fund revision');return n;}
  async function get(name,id){current();const s=await api.getDocFromServer(ref(name,id));stable(s);current();return s;}
  async function read(input){
   if(!input||input.orgId!==orgId||typeof input.requestId!=='string'||!/^[a-f0-9]{32}$/.test(input.requestId)||!['submitRemittance','recordExpense'].includes(input.operation))fail('Invalid pending request');
   const isRem=input.operation==='submitRemittance';
   if(isRem&&(!Array.isArray(input.paymentIds)||!input.paymentIds.length||input.paymentIds.length>200||input.paymentIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))||new Set(input.paymentIds).size!==input.paymentIds.length))fail('Invalid remittance plan');
   const revision=marker(await get('sparkRevision','current')),id=(isRem?'rem_':'exp_')+input.requestId,parent=await get(isRem?'sparkRemittances':'sparkExpenseDrafts',id);
   const records={remittances:[],expenses:[],payments:[]};
   if(parent.exists()){
    if(revision===0)fail('Faculty Fund revision is missing');const item={...parent.data(),id};
    if(isRem){
     if(!Array.isArray(item.paymentIds)||JSON.stringify(item.paymentIds)!==JSON.stringify(input.paymentIds))fail('Pending request does not match server remittance');
     records.remittances.push(item);
     if(['declined','cancelled','voided'].includes(item.status))for(const paymentId of input.paymentIds){const p=await get('sparkPayments',paymentId);if(!p.exists())fail('Selected payment is missing; reconciliation required');const data=p.data();if(!(data.remittanceId===null||typeof data.remittanceId==='string'))fail('Invalid payment link');records.payments.push({...data,id:paymentId});}
    }else records.expenses.push(item);
   }
   const end=marker(await get('sparkRevision','current'));if(end!==revision)fail('Faculty Fund changed during reconciliation; retry');current();return {revision,records};
  }
  return {read};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkPendingReader:createPendingReader};else global.createFacultyFundSparkPendingReader=createPendingReader;
})(typeof window!=='undefined'?window:globalThis);
