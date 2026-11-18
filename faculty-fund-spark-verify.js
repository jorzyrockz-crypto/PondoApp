/* Local diagnostic-copy verification. This is not authentication, a backup
 * restore, or an authorization boundary. Never write from a checked copy. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 const collections=['people','payments','slots','remittances','lines','wallets','expenses','allocations','corrections','presidentHistory','memberReceipts','remittanceReceipts'];
 const amounts=['receivedCents','acceptedCents','spentCents','reservedCents','frozenCents','spendableCents','unremittedCents','balanceCents'];
 function decode(v,depth=0){
  if(depth>50)fail('Diagnostic copy is too deeply nested');
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))fail('Invalid diagnostic number');return v;}
  if(Array.isArray(v))return v.map(x=>decode(x,depth+1));
  if(!v||typeof v!=='object')fail('Invalid diagnostic value');const keys=Object.keys(v);
  if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))fail('Invalid diagnostic field');
  if(keys.includes('$date')){if(keys.length!==1||typeof v.$date!=='string')fail('Invalid diagnostic timestamp');const d=new Date(v.$date);if(!Number.isFinite(d.getTime())||d.toISOString()!==v.$date)fail('Invalid diagnostic timestamp');return d;}
  if(keys.includes('$timestamp')){
   if(keys.length!==1||!v.$timestamp||Object.keys(v.$timestamp).sort().join(',')!=='nanoseconds,seconds')fail('Invalid diagnostic timestamp');
   const {seconds,nanoseconds}=v.$timestamp;if(!Number.isSafeInteger(seconds)||seconds< -62135596800||seconds>253402300799||!Number.isInteger(nanoseconds)||nanoseconds<0||nanoseconds>=1000000000)fail('Invalid diagnostic timestamp');
   return {seconds,nanoseconds,toMillis:()=>seconds*1000+nanoseconds/1000000,toDate:()=>new Date(seconds*1000+Math.floor(nanoseconds/1000000))};
  }
  const out=Object.create(null);for(const k of keys)out[k]=decode(v[k],depth+1);return out;
 }
 const millis=v=>v instanceof Date?v.getTime():typeof v?.toMillis==='function'?v.toMillis():NaN;
 async function verifyDiagnostic({envelope,orgId,verifyChecksum,project}){
  if(typeof orgId!=='string'||!orgId||typeof verifyChecksum!=='function'||typeof project!=='function')fail('Diagnostic verification is unavailable');
  if(!await verifyChecksum(envelope))fail('The diagnostic checksum does not match');
  const p=envelope.payload;if(!p||p.orgId!==orgId||typeof p.actorUid!=='string'||!p.actorUid||!Number.isSafeInteger(p.revision)||p.revision<1||typeof p.clientExportedAt!=='string'||!Number.isFinite(Date.parse(p.clientExportedAt)))fail('Diagnostic copy belongs to another workspace or is invalid');
  if(!p.records||typeof p.records!=='object'||Array.isArray(p.records)||Object.keys(p.records).sort().join(',')!==[...collections].sort().join(','))fail('Diagnostic record collections are incomplete');
  const records=decode(p.records),counts={};for(const name of collections){const rows=records[name];if(!Array.isArray(rows)||rows.length>1000)fail('Diagnostic collection exceeds the safe limit');const ids=new Set();for(const row of rows){if(!row||typeof row.id!=='string'||!row.id||row.id.includes('/')||ids.has(row.id))fail('Invalid diagnostic record ID');ids.add(row.id);}counts[name]=rows.length;}
  const config=decode(p.config);if(config){const matches=records.presidentHistory.filter(x=>x.id===config.assignmentId);const a=matches[0];if(matches.length!==1||a.presidentUid!==config.presidentUid||a.assignedBy!==config.assignedBy||!Number.isFinite(millis(config.assignedAt))||millis(config.assignedAt)!==millis(a.assignedAt))fail('Diagnostic President assignment is inconsistent');}else if(records.presidentHistory.length)fail('Diagnostic President assignment is missing');
  const result=project({confirmed:true,...records});if(!p.summary||amounts.some(k=>!Number.isSafeInteger(p.summary[k])||p.summary[k]!==result[k]))fail('Diagnostic totals do not reconcile');
  const pending=a=>Array.isArray(a)?a.map(x=>x&&typeof x.kind==='string'&&typeof x.id==='string'?x.kind+'\u0000'+x.id:null).sort():null;
  if(JSON.stringify(pending(p.summary.pendingWork))!==JSON.stringify(pending(result.pendingWork)))fail('Diagnostic unfinished work does not match');
  return {revision:p.revision,counts,unfinished:result.pendingWork.length,notice:'Checksum and selected ledger checks passed. This does not prove authenticity or completeness; this file cannot restore the fund.'};
 }
 if(typeof module==='object'&&module.exports)module.exports={verifySparkDiagnostic:verifyDiagnostic};else global.verifyFacultyFundSparkDiagnostic=verifyDiagnostic;
})(typeof window!=='undefined'?window:globalThis);
