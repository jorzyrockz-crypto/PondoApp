import { refundReceiptDigest } from './member-refund-service.mjs?v=177';
// Plan only newly introduced editor receipt references. Never publish a
// pointer whose image cannot be verified. Existing references stay immutable.
export async function planEditorRefundReceipts(snapshot, baselineJSON) {
 const before=baselineJSON?JSON.parse(baselineJSON):{},old=new Map((Array.isArray(before.payables)?before.payables:[]).map(b=>[b.id,b])),result=[];
 let bytes=0;
 for(const bill of Array.isArray(snapshot?.payables)?snapshot.payables:[]){
  if(!bill?.sharedReceiptDigest||bill.sharedReceiptKind!=='editor')continue;
  if(bill.kind!=='advance'||typeof bill.id!=='string'||!bill.id||bill.id.length>150||bill.id.includes('/')||!/^[a-f0-9]{64}$/.test(bill.sharedReceiptDigest))throw Error('Invalid shared receipt reference.');
  const prior=old.get(bill.id);
  if(prior?.sharedReceiptDigest){if(prior.sharedReceiptDigest!==bill.sharedReceiptDigest||prior.sharedReceiptKind!=='editor')throw Error('Shared receipt references cannot be replaced.');continue;}
  if(await refundReceiptDigest(bill.receiptImage)!==bill.sharedReceiptDigest)throw Error('The receipt image is missing or does not match.');
  bytes+=bill.receiptImage.length;result.push({id:bill.id,digest:bill.sharedReceiptDigest,image:bill.receiptImage});
  if(result.length>10||bytes>6000000)throw Error('Too many receipt images are waiting to sync.');
 }
 return result;
}
// All reads are completed before any writes. The caller commits the snapshot
// in the same transaction; a failed transaction leaves neither partial write.
export async function writeEditorRefundReceipts({transaction,db,doc,serverTimestamp,orgId,uid,items}) {
 const refs=items.map(item=>doc(db,'organizations',orgId,'editorRefundReceipts',item.id));
 const existing=await Promise.all(refs.map(ref=>transaction.get(ref)));
 for(let i=0;i<items.length;i++)if(existing[i].exists()){
  const value=existing[i].data();if(value.digest!==items[i].digest||await refundReceiptDigest(value.image)!==items[i].digest)throw Error('A different shared receipt already uses this ID.');
 }
 return ()=>{for(let i=0;i<items.length;i++)if(!existing[i].exists())transaction.set(refs[i],{uid,digest:items[i].digest,image:items[i].image,createdAt:serverTimestamp()});};
}
