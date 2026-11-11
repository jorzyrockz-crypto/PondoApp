'use strict';

// Builds a deliberately minimal public projection. This function only
// transforms data; it does not publish anything or change access rules.
// Never include source IDs or free-text fields in its output.
function buildPublicReport(snapshot, selection) {
  if (!snapshot || typeof snapshot !== 'object' || !selection || typeof selection !== 'object') throw new Error('Invalid report input');
  const keys=['funds','txs','projects','allocations','contributionActivities','contributors','contributionPayments'];
  for(const key of keys) if(!Array.isArray(snapshot[key])) throw new Error('Invalid snapshot: '+key);
  const enabled = key => selection[key] === true;
  const amount = value => {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim()==='') throw new Error('Invalid amount');
    const n=Number(value), cents=Math.round(n*100);
    if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(cents)) throw new Error('Invalid amount');
    return cents;
  };
  const sum = values => values.reduce((total,value)=>{
    const next=total+value;
    if(!Number.isSafeInteger(next)) throw new Error('Amount exceeds safe range');
    return next;
  },0);
  const date = value => {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid transaction date');
    const d=new Date(value+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value) throw new Error('Invalid transaction date');
    return value;
  };
  const txRow = t => {
    if(t.type!=='IN'&&t.type!=='OUT') throw new Error('Invalid transaction type');
    return {date:date(t.date),label:t.type==='IN'?'Funds received':'Fund expense',amountCents:amount(t.amount),direction:t.type};
  };
  const report={version:1};
  if(enabled('funds')) report.funds=snapshot.funds.map((fund,i)=>{
    const rows=snapshot.txs.filter(t=>t.fundId===fund.id).map(txRow);
    const received=sum([amount(fund.initialAmount),...rows.filter(t=>t.direction==='IN').map(t=>t.amountCents)]);
    const spent=sum(rows.filter(t=>t.direction==='OUT').map(t=>t.amountCents));
    return {label:'Fund '+(i+1),receivedCents:received,spentCents:spent,balanceCents:received-spent,transactions:rows};
  });
  if(enabled('projects')) report.projects=snapshot.projects.map((project,i)=>{
    const rows=snapshot.txs.filter(t=>t.projectId===project.id).map(txRow);
    const allocated=sum(snapshot.allocations.filter(a=>a.projectId===project.id).map(a=>amount(a.amount)));
    const spent=sum(rows.filter(t=>t.direction==='OUT').map(t=>t.amountCents));
    return {label:'Project '+(i+1),allocatedCents:allocated,spentCents:spent,remainingCents:allocated-spent,transactions:rows};
  });
  if(enabled('contributions')) report.contributions=snapshot.contributionActivities.map((activity,i)=>{
    const people=snapshot.contributors.filter(p=>p.activityId===activity.id);
    const ids=new Set(people.map(p=>p.id));
    const rows=snapshot.contributionPayments.filter(p=>ids.has(p.contributorId)).map(p=>({date:date(p.date),label:'Contribution payment',amountCents:amount(p.amount)}));
    const expected=sum(people.map(p=>amount(p.expected)));
    const paid=sum(rows.map(p=>p.amountCents));
    return {label:'Contribution '+(i+1),expectedCents:expected,paidCents:paid,outstandingCents:expected-paid,transactions:rows};
  });
  return report;
}

if(typeof module!=='undefined' && module.exports) module.exports={buildPublicReport};
if(typeof window!=='undefined') window.PondoPublicReport={buildPublicReport};
