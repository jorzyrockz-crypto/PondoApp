'use strict';
// Standalone, side-effect-free receipt markup generator for trusted server
// records. Not connected to the app's print UI or to a deployed endpoint.
const MAX_RECEIPTS=200;
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function money(cents){if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Invalid amount');const n=BigInt(cents),whole=String(n/100n).replace(/\B(?=(\d{3})+(?!\d))/g,',');return '₱'+whole+'.'+String(n%100n).padStart(2,'0');}
function accepted(state,id){
 const r=state.remittances.find(r=>r.id===id&&r.status==='accepted');
 if(!r||r.voidRequest||!r.acceptedAt||r.acceptedByUid!==r.presidentUid||!Array.isArray(r.paymentIds)||!r.paymentIds.length||new Set(r.paymentIds).size!==r.paymentIds.length)throw Error('Remittance is not accepted');
 const items=r.paymentIds.map(pid=>state.payments.find(p=>p.id===pid));
 if(items.some(p=>!p||p.voidedAt))throw Error('Remittance contains unavailable payments');
 let total=0;for(const p of items){money(p.amountCents);total+=p.amountCents;if(!Number.isSafeInteger(total))throw Error('Invalid amount')}
 if(total!==r.amountCents)throw Error('Remittance total does not match payments');
 const d=new Date(r.acceptedAt);if(!Number.isFinite(d.getTime()))throw Error('Invalid acceptance time');
 return {r,items,total,stamp:new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(d)+' (Philippine time)'};
}
function header(org,title){return `<header><p>${esc(org||'Faculty Fund')}</p><h1>${esc(title)}</h1><p>Faculty Fund · Special Collection</p></header>`}
function page(body){return `<section class="receipt">${body}</section>`}
function documentHtml(title,body){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{font:14px/1.45 system-ui,sans-serif;color:#142237;margin:0 auto;max-width:820px}h1{font-size:22px;margin:.2em 0}p{margin:.35em 0}header{border-bottom:2px solid #17355e;padding-bottom:10px;margin-bottom:12px}.receipt{border:1px solid #b9c5d2;padding:18px;margin-bottom:18px;break-inside:avoid}dl{display:grid;grid-template-columns:145px 1fr;gap:5px;margin:12px 0}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #b9c5d2;padding:6px;text-align:left;overflow-wrap:anywhere}tfoot{font-weight:bold}.note{font-size:11px;margin-top:15px;color:#394d64}@media print{.receipt{break-after:page;margin:0;border:0;padding:0}.receipt:last-child{break-after:auto}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>${body}</body></html>`}
function memberReceipt(state,paymentId,organizationName){
 const related=state.remittances.filter(r=>r.status==='accepted'&&Array.isArray(r.paymentIds)&&r.paymentIds.includes(paymentId));
 if(related.length!==1)throw Error('Payment is not uniquely accepted');
 const {r,items,stamp}=accepted(state,related[0].id),p=items.find(x=>x.id===paymentId);
 return page(`${header(organizationName,'Member payment acknowledgment')}<dl><dt>Member</dt><dd>${esc(p.memberName)}</dd><dt>Absence date</dt><dd>${esc(p.absenceDate)}</dd><dt>Paid on</dt><dd>${esc(p.paymentDate)}</dd><dt>Amount received</dt><dd>${money(p.amountCents)}</dd><dt>Received by</dt><dd>${esc(p.receivedByName||'AO')}</dd><dt>Remittance</dt><dd>${esc(r.id)}</dd><dt>Accepted by</dt><dd>${esc(r.acceptedByName||'Faculty President')}</dd><dt>Accepted on</dt><dd>${esc(stamp)}</dd></dl><p class="note">This acknowledgment records the payment and the President’s acceptance of its remittance in Pondo. Printing alone does not confirm a physical transfer.</p>`);
}
function renderMemberReceipts(state,paymentIds,organizationName){
 if(!Array.isArray(paymentIds)||!paymentIds.length||paymentIds.length>MAX_RECEIPTS||new Set(paymentIds).size!==paymentIds.length)throw Error('Choose distinct payments');
 return documentHtml('Member payment acknowledgments',paymentIds.map(id=>memberReceipt(state,id,organizationName)).join(''));
}
function renderRemittanceReceipt(state,remittanceId,organizationName){
 const {r,items,total,stamp}=accepted(state,remittanceId);
 const rows=items.map(p=>`<tr><td>${esc(p.memberName)}</td><td>${esc(p.absenceDate)}</td><td>${esc(p.paymentDate)}</td><td>${money(p.amountCents)}</td></tr>`).join('');
 return documentHtml('Remittance acknowledgment',page(`${header(organizationName,'Remittance acknowledgment')}<dl><dt>Remittance</dt><dd>${esc(r.id)}</dd><dt>Submitted by</dt><dd>${esc(r.submittedByName||'AO')}</dd><dt>Accepted by</dt><dd>${esc(r.acceptedByName||'Faculty President')}</dd><dt>Accepted on</dt><dd>${esc(stamp)}</dd><dt>Payment count</dt><dd>${items.length}</dd></dl><table><thead><tr><th>Member</th><th>Absence date</th><th>Payment date</th><th>Amount</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Total remitted</td><td>${money(total)}</td></tr></tfoot></table><p class="note">This receipt records acceptance of a handover, not an expense. Printing alone does not confirm a physical transfer.</p>`));
}
module.exports={renderMemberReceipts,renderRemittanceReceipt};
