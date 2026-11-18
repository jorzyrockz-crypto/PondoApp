/* Experimental diagnostic export, not a restore mechanism or authentication.
 * Members who can read the records can independently copy them. Never import
 * this file as a replacement for authenticated President decisions. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function clean(value,seen=new Set()){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))fail('Invalid export number');return value;}
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))fail('Invalid export timestamp');return {$date:value.toISOString()};}
  if(value&&typeof value.toMillis==='function'&&Number.isSafeInteger(value.seconds)&&Number.isInteger(value.nanoseconds)&&value.nanoseconds>=0&&value.nanoseconds<1000000000)return {$timestamp:{seconds:value.seconds,nanoseconds:value.nanoseconds}};
  if(!value||typeof value!=='object'||seen.has(value))fail('Unsupported export data');seen.add(value);
  let out;if(Array.isArray(value))out=value.map(v=>clean(v,seen));else{const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)fail('Unsupported export object');out=Object.create(null);for(const key of Object.keys(value).sort())out[key]=clean(value[key],seen);}seen.delete(value);return out;
 }
 function canonical(value){if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
 async function checksum(value){if(!global.crypto?.subtle||typeof TextEncoder==='undefined')fail('Secure checksum is unavailable');const data=new TextEncoder().encode(canonical(value)),bytes=new Uint8Array(await global.crypto.subtle.digest('SHA-256',data));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
 async function makeExport(snapshot,{orgId,actorUid,role,now=new Date()}={}){
  if(role!=='owner'||typeof orgId!=='string'||!orgId||typeof actorUid!=='string'||!actorUid)fail('A confirmed workspace owner is required');
  if(!snapshot||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||!snapshot.records||!snapshot.projection)fail('Confirmed Faculty Fund data is required');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('Invalid export time');
  const payload=clean({orgId,actorUid,clientExportedAt:now.toISOString(),revision:snapshot.revision,config:snapshot.config,records:snapshot.records,summary:snapshot.projection});
  return {format:'pondo-faculty-spark-diagnostic-v1',payload,checksum:await checksum(payload)};
 }
 async function verify(envelope){try{if(envelope?.format!=='pondo-faculty-spark-diagnostic-v1'||typeof envelope.checksum!=='string'||!/^[a-f0-9]{64}$/.test(envelope.checksum)||!envelope.payload)return false;return await checksum(clean(envelope.payload))===envelope.checksum}catch{return false}}
 if(typeof module==='object'&&module.exports)module.exports={makeSparkDiagnosticExport:makeExport,verifySparkDiagnosticExport:verify,cleanSparkDiagnosticValue:clean};else global.FacultyFundSparkExport={make:makeExport,verify,clean};
})(typeof window!=='undefined'?window:globalThis);
