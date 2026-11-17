/* Experimental read adapter for the existing Faculty Fund UI contract.
 * Read-only and NOT connected to the app. Do not expose it as a complete API. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function timestamp(value){if(!value)return null;const d=value instanceof Date?value:typeof value.toDate==='function'?value.toDate():null;if(!d||!Number.isFinite(d.getTime()))fail('Invalid Faculty Fund timestamp');return d.toISOString()}
 function manilaDay(value){const d=value instanceof Date?value:typeof value?.toDate==='function'?value.toDate():null;if(!d||!Number.isFinite(d.getTime()))fail('Invalid Faculty Fund date');const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),part=k=>p.find(x=>x.type===k).value;return `${part('year')}-${part('month')}-${part('day')}`}
 function createReadAdapter({getContext,makeReader,makeReceipts,makeReport,reportCsv,makeExport}){
  if([getContext,makeReader,makeReceipts,makeReport,reportCsv,makeExport].some(x=>typeof x!=='function'))fail('Invalid read adapter setup');
  function context(orgId){const c=getContext();if(!c||c.memberConfirmed!==true||!c.orgId||!c.uid||!['owner','disbursing','project-manager','reviewer'].includes(c.role)||c.orgId!==orgId||!['string','number'].includes(typeof c.scopeToken))fail('Open a confirmed team workspace');return {...c};}
  function current(old){const c=getContext();return !!c&&c.memberConfirmed===true&&c.orgId===old.orgId&&c.uid===old.uid&&c.role===old.role&&c.scopeToken===old.scopeToken;}
  async function load(c){const snapshot=await makeReader(c,()=>current(c)).read();if(!current(c))fail('Workspace changed while loading');return snapshot;}
  function stateView(snapshot,c){
   const {records:r,projection:p}=snapshot;
   // This old UI cannot yet resume multi-step operations from another device.
   if(p.pendingWork.some(x=>['remittance-draft','expense-draft','expense-cancelling','expense-voiding'].includes(x.kind)))fail('An unfinished Faculty Fund operation needs recovery before opening this view');
   const members=Array.isArray(c.members)?c.members:[],name=uid=>{const m=members.find(x=>x.uid===uid);return m?.displayName||m?.email||'Team member'},marks=new Map(r.memberReceipts.map(x=>[x.id,x])),remitMarks=new Map(r.remittanceReceipts.map(x=>[x.id,x])),corrections=new Map(r.corrections.map(x=>[x.id,x]));
   const payments=r.payments.map(x=>({...x,receivedByUid:x.createdBy,receivedByName:name(x.createdBy),createdAt:timestamp(x.createdAt),voidedAt:timestamp(x.voidedAt),memberReceiptPrintedAt:timestamp(marks.get(x.remittanceId+'~'+x.id)?.printedAt)}));
   const remittances=r.remittances.map(x=>{const correction=x.correctionId?corrections.get(x.correctionId):null;return {...x,submittedByUid:x.createdBy,submittedByName:name(x.createdBy),submittedAt:timestamp(x.submittedAt||x.createdAt),acceptedByUid:x.acceptedBy||null,acceptedByName:x.acceptedBy?name(x.acceptedBy):null,acceptedAt:timestamp(x.acceptedAt),declinedAt:timestamp(x.declinedAt),declineReason:x.status==='declined'?x.reason:null,voidedAt:timestamp(x.voidedAt),receiptPrintedAt:timestamp(remitMarks.get(x.id)?.printedAt),voidRequest:correction?.status==='pending'?{requestedByUid:correction.requestedBy,requestedAt:timestamp(correction.requestedAt),reason:correction.reason}:null};});
   const expenses=r.expenses.filter(x=>['recorded','voided'].includes(x.status)).map(x=>({...x,date:manilaDay(x.occurredAt),occurredAt:timestamp(x.occurredAt),createdAt:timestamp(x.createdAt),voidedAt:timestamp(x.voidedAt),recordedByUid:x.createdBy,recordedByName:name(x.createdBy)}));
   const audit=[];function event(kind,id,actorUid,at,reason){if(at)audit.push({kind,id,actorUid,at:timestamp(at),...(reason?{reason}:{})});}
   for(const x of r.presidentHistory)event('president-assigned',x.id,x.assignedBy,x.assignedAt);
   for(const x of r.people)event('faculty-person-added',x.id,x.createdBy,x.createdAt);
   for(const x of r.payments){event('payment-recorded',x.id,x.createdBy,x.createdAt);event('payment-voided',x.id,x.voidedBy,x.voidedAt,x.voidReason)}
   for(const x of r.remittances){event('remittance-submitted',x.id,x.createdBy,x.submittedAt);event('remittance-accepted',x.id,x.acceptedBy,x.acceptedAt);event('remittance-declined',x.id,x.declinedBy,x.declinedAt,x.reason);event('remittance-cancelled',x.id,x.cancelledBy,x.cancelledAt,x.reason)}
   for(const x of r.corrections){event('remittance-void-requested',x.id,x.requestedBy,x.requestedAt,x.reason);event('remittance-void-'+x.status,x.id,x.decidedBy,x.decidedAt,x.decisionReason)}
   for(const x of r.expenses){event('expense-recorded',x.id,x.createdBy,x.recordedAt);event('expense-void-requested',x.id,x.voidRequestedBy,x.voidRequestedAt,x.voidReason);event('expense-voided',x.id,x.voidRequestedBy,x.voidedAt,x.voidReason)}
   for(const x of r.memberReceipts)event('member-receipt-marked-printed',x.id,x.printedBy,x.printedAt);
   for(const x of r.remittanceReceipts)event('remittance-receipt-marked-printed',x.id,x.printedBy,x.printedAt);
   audit.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
   const rows=p.rows.map(x=>({...x,date:x.type==='OUT'?manilaDay(x.occurredAt):x.date,description:x.type==='IN'?'Absence payment':x.description})).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
   return {state:{people:r.people,payments,remittances,expenses,audit},config:snapshot.config,revision:snapshot.revision,ledger:{...p,rows},role:c.role};
  }
  async function read(input){const c=context(input?.orgId),snapshot=await load(c);let output;
   if(input.view==='state')output=stateView(snapshot,c);
   else if(input.view==='memberReceipts'||input.view==='remittanceReceipt'){
    if(!['owner','disbursing'].includes(c.role))fail('Only an authorized collector can print receipts');const view=makeReceipts(snapshot,{organizationName:c.orgName||'Faculty Fund',members:c.members||[]});output={html:input.view==='memberReceipts'?view.membersHtml(input.paymentIds):view.remittanceHtml(input.remittanceId)};
   }else if(input.view==='report'||input.view==='csv'){const report=makeReport(snapshot,{from:input.from||'',to:input.to||''});output=input.view==='csv'?{csv:reportCsv(report)}:{report};}
   else fail('Unknown Faculty Fund view');
   if(!current(c))fail('Workspace changed while loading');return output;
  }
  async function exportDiagnostic(input){const c=context(input?.orgId);if(c.role!=='owner')fail('Only a workspace owner can export');const snapshot=await load(c),result=await makeExport(snapshot,{orgId:c.orgId,actorUid:c.uid,role:c.role});if(!current(c))fail('Workspace changed while exporting');return result;}
  return {read,export:exportDiagnostic};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkReadAdapter};else global.createFacultyFundSparkReadAdapter=createReadAdapter;
})(typeof window!=='undefined'?window:globalThis);
