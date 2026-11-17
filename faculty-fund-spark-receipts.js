/* Experimental receipts for revision-confirmed Spark snapshots. Not loaded by
 * the app. Rendering and physical printing do not change Firestore state. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>{if(!Number.isSafeInteger(v)||v<=0)fail('Invalid receipt amount');const n=BigInt(v);return '₱'+String(n/100n).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+String(n%100n).padStart(2,'0')};
 const stamp=v=>{const d=v instanceof Date?v:typeof v?.toDate==='function'?v.toDate():null;if(!d||!Number.isFinite(d.getTime()))fail('Invalid acceptance timestamp');return new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(d)+' (Philippine time)'};
 function receiptView(snapshot,{organizationName='Faculty Fund',members=[]}={}){
  if(!snapshot||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||!snapshot.projection||!snapshot.records)fail('Confirmed Faculty Fund data is required');
  const rec=snapshot.records,required=['payments','remittances','lines','memberReceipts','remittanceReceipts'];if(required.some(k=>!Array.isArray(rec[k])))fail('Receipt records are incomplete');
  const payments=new Map(rec.payments.map(p=>[p.id,p])),remittances=new Map(rec.remittances.map(r=>[r.id,r])),memberMarks=new Set(rec.memberReceipts.map(x=>x.id)),remitMarks=new Set(rec.remittanceReceipts.map(x=>x.id));
  const memberName=uid=>{const found=Array.isArray(members)?members.find(m=>m&&m.uid===uid):null;return found?.displayName||found?.email||'Team member'};
  function accepted(id){
   const r=remittances.get(id);if(!r||r.status!=='accepted'||r.correctionId!==null||!Array.isArray(r.paymentIds)||!r.paymentIds.length||new Set(r.paymentIds).size!==r.paymentIds.length||r.acceptedBy!==r.presidentUid)fail('Remittance is not available for printing');
   const items=r.paymentIds.map(pid=>{const p=payments.get(pid),line=rec.lines.find(l=>l.id===id+'~'+pid);if(!p||p.voidedAt||p.remittanceId!==id||!line||line.amountCents!==p.amountCents)fail('Remittance payments are inconsistent');return p});
   let total=0;for(const item of items){if(!Number.isSafeInteger(item.amountCents)||item.amountCents<=0)fail('Invalid receipt amount');total+=item.amountCents;if(!Number.isSafeInteger(total))fail('Receipt total overflow');}
   if(total!==r.amountCents||r.count!==items.length)fail('Remittance total does not match payments');return {r,items,total,acceptedAt:stamp(r.acceptedAt)};
  }
  function paymentInfo(id){const p=payments.get(id);if(!p||!p.remittanceId)fail('Payment has not been accepted');const data=accepted(p.remittanceId);if(!data.items.some(item=>item.id===id))fail('Payment not in accepted remittance');return {p,...data};}
  function header(title){return `<header><p>${esc(organizationName)}</p><h1>${esc(title)}</h1><p>Faculty Fund · Special Collection</p></header>`}
  function page(body){return `<section class="receipt">${body}</section>`}
  function documentHtml(title,body){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{font:14px/1.45 system-ui,sans-serif;color:#142237;margin:0 auto;max-width:820px}h1{font-size:22px;margin:.2em 0}p{margin:.35em 0}header{border-bottom:2px solid #17355e;padding-bottom:10px;margin-bottom:12px}.receipt{border:1px solid #b9c5d2;padding:18px;margin-bottom:18px;break-inside:avoid}dl{display:grid;grid-template-columns:145px 1fr;gap:5px;margin:12px 0}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #b9c5d2;padding:6px;text-align:left;overflow-wrap:anywhere}tfoot{font-weight:bold}.note{font-size:11px;margin-top:15px;color:#394d64}@media print{.receipt{break-after:page;margin:0;border:0;padding:0}.receipt:last-child{break-after:auto}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>${body}</body></html>`}
  const note=`<p class="note">Snapshot revision ${snapshot.revision}. Printing is not proof of physical transfer. Confirm printing separately in Pondo.</p>`;
  function membersHtml(ids){
   if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length)fail('Choose distinct payments');
   return documentHtml('Member payment acknowledgments',ids.map(id=>{const {p,r,acceptedAt}=paymentInfo(id);return page(`${header('Member payment acknowledgment')}<dl><dt>Member</dt><dd>${esc(p.memberName)}</dd><dt>Absence date</dt><dd>${esc(p.absenceDate)}</dd><dt>Paid on</dt><dd>${esc(p.paymentDate)}</dd><dt>Amount received</dt><dd>${money(p.amountCents)}</dd><dt>Received by</dt><dd>${esc(memberName(p.createdBy))}</dd><dt>Remittance</dt><dd>${esc(r.id)}</dd><dt>Accepted by</dt><dd>${esc(memberName(r.acceptedBy))}</dd><dt>Accepted on</dt><dd>${esc(acceptedAt)}</dd></dl>${note}`)}).join(''));
  }
  function remittanceHtml(id){const {r,items,total,acceptedAt}=accepted(id),rows=items.map(p=>`<tr><td>${esc(p.memberName)}</td><td>${esc(p.absenceDate)}</td><td>${esc(p.paymentDate)}</td><td>${money(p.amountCents)}</td></tr>`).join('');return documentHtml('Remittance acknowledgment',page(`${header('Remittance acknowledgment')}<dl><dt>Remittance</dt><dd>${esc(r.id)}</dd><dt>Submitted by</dt><dd>${esc(memberName(r.createdBy))}</dd><dt>Accepted by</dt><dd>${esc(memberName(r.acceptedBy))}</dd><dt>Accepted on</dt><dd>${esc(acceptedAt)}</dd><dt>Payment count</dt><dd>${items.length}</dd></dl><table><thead><tr><th>Member</th><th>Absence date</th><th>Payment date</th><th>Amount</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Total remitted</td><td>${money(total)}</td></tr></tfoot></table>${note}`));}
  function unprinted(){return rec.payments.filter(p=>{if(!p||!p.remittanceId||p.voidedAt||memberMarks.has(p.remittanceId+'~'+p.id))return false;try{paymentInfo(p.id);return true}catch{return false}}).map(p=>p.id);}
  return {membersHtml,remittanceHtml,unprinted,remittancePrinted:id=>remitMarks.has(id)};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkReceiptView:receiptView};else global.createFacultyFundSparkReceiptView=receiptView;
})(typeof window!=='undefined'?window:globalThis);
