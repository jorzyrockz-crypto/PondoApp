'use strict';
// Read-only report over the protected Faculty Fund prototype. It is separate
// from Pondo's existing fund report and is not wired into the application.
const {facultyCashLedger}=require('./faculty-fund-ledger.cjs');
function validDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T00:00:00.000Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function safeAdd(a,b){const result=a+b;if(!Number.isSafeInteger(result))throw Error('Report amount overflow');return result;}
function facultyReport(state,{from='',to=''}={}){
 if((from&&!validDay(from))||(to&&!validDay(to))||(from&&to&&from>to))throw Error('Invalid report date range');
 const ledger=facultyCashLedger(state);let openingCents=0,receivedCents=0,spentCents=0;const entries=[];
 for(const row of ledger.rows){
  if(to&&row.date>to)continue;
  if(from&&row.date<from){openingCents=safeAdd(openingCents,row.type==='IN'?row.amountCents:-row.amountCents);continue;}
  if(row.type==='IN')receivedCents=safeAdd(receivedCents,row.amountCents);else spentCents=safeAdd(spentCents,row.amountCents);
  entries.push({...row});
 }
 return {scope:'Faculty Fund only',from,to,openingCents,receivedCents,spentCents,closingCents:safeAdd(safeAdd(openingCents,receivedCents),-spentCents),entries};
}
function csvCell(value){let text=String(value??'');if(/^[\s\u0000-\u001f\u007f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function peso(cents){if(!Number.isSafeInteger(cents))throw Error('Invalid report amount');const c=BigInt(cents),sign=c<0n?'-':'',v=c<0n?-c:c;return sign+String(v/100n)+'.'+String(v%100n).padStart(2,'0');}
function facultyReportCsv(state,range){
 const report=facultyReport(state,range);
 const rows=[['Report scope',report.scope],['From',report.from||'Beginning','To',report.to||'Latest'],['Opening cash',peso(report.openingCents),'Received',peso(report.receivedCents),'Spent',peso(report.spentCents),'Closing cash',peso(report.closingCents)],[],['Date','Type','Description','Member or payee','Absence date','Reference','Amount PHP'],...report.entries.map(r=>[r.date,r.type,r.description,r.type==='IN'?r.memberName:r.payee,r.absenceDate||'',r.reference||'',peso(r.amountCents)])];
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
module.exports={facultyReport,facultyReportCsv};
