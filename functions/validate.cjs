'use strict';

// Validate at the trusted publishing boundary; never expose a report merely
// because a browser claims it was sanitized. This module does not publish it.
const MAX_REPORT_BYTES=700_000;
const MAX_RECORDS=3000;
function validatePublicReport(report, selection){
  const fail=()=>{throw new Error('Invalid public report');};
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const keys=(value,expected)=>object(value)&&Object.keys(value).length===expected.length&&expected.every(k=>Object.hasOwn(value,k));
  const integer=(n,signed=false)=>Number.isSafeInteger(n)&&(signed||n>=0);
  const date=d=>{
    if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
    const t=new Date(d+'T00:00:00Z');return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===d;
  };
  const add=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))fail();return n;};
  if(!object(selection)||!object(report))fail();
  const scopes=['funds','projects','contributions'];
  const selected=scopes.filter(k=>selection[k]===true);
  if(!keys(report,['version',...selected])||report.version!==1)fail();
  let count=0;
  for(const scope of selected){
    if(!Array.isArray(report[scope]))fail();
    for(const [i,entry] of report[scope].entries()){
      const kind=scope==='funds'?'Fund':scope==='projects'?'Project':'Contribution';
      const fields=scope==='funds'?['label','receivedCents','spentCents','balanceCents','transactions']:
        scope==='projects'?['label','allocatedCents','spentCents','remainingCents','transactions']:
        ['label','expectedCents','paidCents','outstandingCents','transactions'];
      if(!keys(entry,fields)||entry.label!==kind+' '+(i+1)||!Array.isArray(entry.transactions))fail();
      if(++count>MAX_RECORDS)fail();
      let incoming=0,outgoing=0,paid=0;
      for(const tx of entry.transactions){
        if(++count>MAX_RECORDS)fail();
        if(scope==='contributions'){
          if(!keys(tx,['date','label','amountCents'])||tx.label!=='Contribution payment'||!integer(tx.amountCents)||!date(tx.date))fail();
          paid=add(paid,tx.amountCents);
        }else{
          if(!keys(tx,['date','label','amountCents','direction'])||!integer(tx.amountCents)||!date(tx.date)||
             !((tx.direction==='IN'&&tx.label==='Funds received')||(tx.direction==='OUT'&&tx.label==='Fund expense')))fail();
          if(tx.direction==='IN')incoming=add(incoming,tx.amountCents);else outgoing=add(outgoing,tx.amountCents);
        }
      }
      if(scope==='funds'){
        if(!integer(entry.receivedCents)||!integer(entry.spentCents)||!integer(entry.balanceCents,true)||
           entry.receivedCents<incoming||entry.spentCents!==outgoing||entry.balanceCents!==entry.receivedCents-entry.spentCents)fail();
      }else if(scope==='projects'){
        if(!integer(entry.allocatedCents)||!integer(entry.spentCents)||!integer(entry.remainingCents,true)||
           entry.spentCents!==outgoing||entry.remainingCents!==entry.allocatedCents-entry.spentCents)fail();
      }else if(!integer(entry.expectedCents)||!integer(entry.paidCents)||!integer(entry.outstandingCents,true)||
               entry.paidCents!==paid||entry.outstandingCents!==entry.expectedCents-entry.paidCents)fail();
    }
  }
  // Leave headroom beneath Firestore's document limit and reject instead of
  // silently dropping records. Serialized UTF-8 size includes non-ASCII text.
  const json=JSON.stringify(report);
  if(Buffer.byteLength(json,'utf8')>MAX_REPORT_BYTES)fail();
  return JSON.parse(json);
}
module.exports={validatePublicReport,MAX_REPORT_BYTES,MAX_RECORDS};
