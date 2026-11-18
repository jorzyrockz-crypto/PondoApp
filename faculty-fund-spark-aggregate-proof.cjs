'use strict';
/*
 * OFFLINE ACCOUNTING EXPERIMENT ONLY. Not loaded by Pondo and not a security
 * boundary. A caller can fabricate or omit before/after records. Existing
 * Firestore rules do not protect any aggregate or enforce this reducer.
 * Never show these numbers as a balance or use them to authorize spending.
 */
const keys=['receivedCents','acceptedCents','spentCents','reservedCents','frozenCents','spendableCents'];
const fail=m=>{throw Error('Aggregate proof: '+m)};
const nat=n=>Number.isSafeInteger(n)&&n>=0;
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n))fail('amount overflow');return n;}
function totals(x){
 if(!x||keys.some(k=>!nat(x[k]))||!nat(x.revision))fail('invalid totals or revision');
 const balance=x.receivedCents-x.spentCents,unremitted=x.receivedCents-x.acceptedCents;
 if(balance<0||unremitted<0||balance!==add(add(add(unremitted,x.reservedCents),x.frozenCents),x.spendableCents))fail('totals do not reconcile');
 return {...Object.fromEntries(keys.map(k=>[k,x[k]])),revision:x.revision,balanceCents:balance,unremittedCents:unremitted};
}
function empty(){return totals({...Object.fromEntries(keys.map(k=>[k,0])),revision:0});}
function amount(n){if(!nat(n)||n===0)fail('invalid amount');return n;}
function date(t){const v=t instanceof Date?t.getTime():typeof t?.toMillis==='function'?t.toMillis():NaN;if(!Number.isFinite(v))fail('invalid timestamp');return v;}
function contribution(kind,v){
 const out=Object.fromEntries(keys.map(k=>[k,0]));if(v===null)return out;
 if(!v||typeof v!=='object')fail('invalid record');
 if(kind==='payment'){
  amount(v.amountCents);if(v.voidedAt===null)out.receivedCents=v.amountCents;else date(v.voidedAt);
 }else if(kind==='expense'){
  amount(v.amountCents);if(!nat(v.allocatedCents)||v.allocatedCents>v.amountCents||!nat(v.count)||v.count>200)fail('invalid expense');
  if(['draft','cancelling'].includes(v.status))out.reservedCents=v.allocatedCents;
  else if(['recorded','voiding'].includes(v.status)){if(v.status==='recorded'&&(v.allocatedCents!==v.amountCents||v.count===0))fail('invalid recorded expense');out.spentCents=v.allocatedCents;}
  else if(!['cancelled','voided'].includes(v.status)||v.allocatedCents!==0||v.count!==0)fail('invalid expense status');
 }else if(kind==='handover'){
  const {remittance:r,wallet:w,correction:c}=v;if(!r){if(w||c)fail('orphan handover component');return out;}
  if(!['draft','pending','accepted','declined','cancelled','voided'].includes(r.status)||!nat(r.amountCents))fail('invalid handover');
  if(!['accepted','voided'].includes(r.status)){if(w||c)fail('unexpected handover component');return out;}
  if(!w||w.amountCents!==r.amountCents||!nat(w.unspentCents)||w.unspentCents>w.amountCents||w.status!==(r.status==='accepted'?'open':'voided')||!r.amountCents||!r.presidentUid||r.acceptedBy!==r.presidentUid||date(r.acceptedAt)!==date(w.acceptedAt))fail('invalid accepted handover');
  if(r.correctionId!==null){if(!c||c.id!==r.correctionId||c.remittanceId!==r.id||c.status!==(r.status==='accepted'?'pending':'approved'))fail('invalid handover correction');}
  else if(c||r.status==='voided')fail('missing handover correction');
  if(r.status==='voided'){if(w.unspentCents!==w.amountCents)fail('voided handover still spent');return out;}
  out.acceptedCents=r.amountCents;out[r.correctionId===null?'spendableCents':'frozenCents']=w.unspentCents;
 }else fail('invalid contribution kind');
 return out;
}
// All relevant changed entities must be included exactly once by the caller.
// Neither that fact nor the legitimacy of any transition can be proven here.
function advance(previous,revision,changes){
 const old=totals(previous);if(!Number.isSafeInteger(revision)||revision!==old.revision+1||!Array.isArray(changes)||changes.length>4)fail('invalid revision or changes');
 const seen=new Set(),next=Object.fromEntries(keys.map(k=>[k,old[k]]));
 for(const item of changes){
  if(!item||!['payment','expense','handover'].includes(item.kind)||typeof item.id!=='string'||!item.id||item.id.includes('/')||item.before===undefined||item.after===undefined)fail('invalid change');
  const key=item.kind+':'+item.id;if(seen.has(key))fail('duplicate change');seen.add(key);
  if(item.kind==='handover')for(const v of [item.before,item.after])if(v&&(v.remittance?.id!==item.id||v.wallet&&v.wallet.id!==item.id))fail('mismatched handover ID');
  const a=contribution(item.kind,item.before),b=contribution(item.kind,item.after);
  for(const k of keys)next[k]=add(add(next[k],-a[k]),b[k]);
 }
 return totals({...next,revision});
}
module.exports={empty,advance};
