'use strict';
// Synthetic emulator-only client; never import into Pondo. This proves only
// atomic create/void accounting in its isolated namespace, not a fund balance.
function createProofClient({db,api,orgId,uid}){
 const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(v))throw Error('Invalid proof ID');return v;};
 if(!db||!api||typeof orgId!=='string'||!orgId||orgId.includes('/')||typeof uid!=='string'||!uid)throw Error('Invalid proof setup');
 const ref=(name,key)=>api.doc(db,`organizations/${orgId}/aggregateProof${name}/${key}`),total=ref('Totals','current');
 const check=t=>{if(!t||!Number.isSafeInteger(t.revision)||t.revision<0||t.revision>=Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(t.receivedCents)||t.receivedCents<0)throw Error('Invalid proof total');};
 async function initialize(){return api.runTransaction(db,async tx=>{const s=await tx.get(total);if(s.exists()){check(s.data());return {replayed:true};}tx.set(total,{revision:0,receivedCents:0,lastAction:'init',lastPaymentId:'',lastSlotId:'',updatedAt:api.serverTimestamp(),updatedBy:uid});return {replayed:false};});}
 async function create(paymentId,slotId,cents){
  id(paymentId);id(slotId);if(!Number.isSafeInteger(cents)||cents<=0||cents>100000000)throw Error('Invalid amount');const p=ref('Payments',paymentId),s=ref('Slots',slotId);
  return api.runTransaction(db,async tx=>{const [ts,ps,ss]=await Promise.all([tx.get(total),tx.get(p),tx.get(s)]);if(!ts.exists())throw Error('Proof not initialized');const t=ts.data();check(t);
   if(ps.exists()){const old=ps.data();if(old.slotId!==slotId||old.amountCents!==cents||old.createdBy!==uid)throw Error('Payment ID has different data');return {replayed:true,voided:!!old.voidedAt};}
   if(ss.exists()&&ss.data().activePaymentId!==null)throw Error('Slot already occupied');if(!Number.isSafeInteger(t.receivedCents+cents))throw Error('Proof total overflow');
   tx.set(p,{slotId,amountCents:cents,createdAt:api.serverTimestamp(),createdBy:uid,voidedAt:null,voidedBy:null,voidReason:null});
   if(ss.exists())tx.update(s,{activePaymentId:paymentId});else tx.set(s,{activePaymentId:paymentId});
   tx.set(total,{revision:t.revision+1,receivedCents:t.receivedCents+cents,lastAction:'create',lastPaymentId:paymentId,lastSlotId:slotId,updatedAt:api.serverTimestamp(),updatedBy:uid});return {replayed:false};
  });
 }
 async function voidPayment(paymentId,reason){
  id(paymentId);if(typeof reason!=='string'||!reason.trim()||reason.length>500)throw Error('Invalid reason');const p=ref('Payments',paymentId);
  return api.runTransaction(db,async tx=>{const [ts,ps]=await Promise.all([tx.get(total),tx.get(p)]);if(!ts.exists()||!ps.exists())throw Error('Proof record missing');const t=ts.data(),old=ps.data();check(t);
   if(old.voidedAt){if(old.voidedBy!==uid||old.voidReason!==reason)throw Error('Payment already voided differently');return {replayed:true};}
   const s=ref('Slots',id(old.slotId)),ss=await tx.get(s);if(!ss.exists()||ss.data().activePaymentId!==paymentId||!Number.isSafeInteger(old.amountCents)||old.amountCents<=0||t.receivedCents<old.amountCents)throw Error('Inconsistent proof record');
   tx.update(p,{voidedAt:api.serverTimestamp(),voidedBy:uid,voidReason:reason});tx.update(s,{activePaymentId:null});tx.set(total,{revision:t.revision+1,receivedCents:t.receivedCents-old.amountCents,lastAction:'void',lastPaymentId:paymentId,lastSlotId:old.slotId,updatedAt:api.serverTimestamp(),updatedBy:uid});return {replayed:false};
  });
 }
 return {initialize,create,voidPayment};
}
module.exports={createProofClient};
