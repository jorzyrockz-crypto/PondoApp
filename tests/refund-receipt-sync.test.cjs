const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');global.crypto ||= webcrypto;
const image='data:image/jpeg;base64,YWJj';
async function modules(){return Promise.all([import('../refund-receipt-sync.mjs'),import('../member-refund-service.mjs')]);}
test('editor receipts are validated and created with immutable references',async()=>{
 const [{planEditorRefundReceipts,writeEditorRefundReceipts},{refundReceiptDigest}]=await modules();const digest=await refundReceiptDigest(image),bill={id:'a',kind:'advance',sharedReceiptKind:'editor',sharedReceiptDigest:digest,receiptImage:image};
 const items=await planEditorRefundReceipts({payables:[bill]},null);assert.equal(items.length,1);
 const writes=[],transaction={get:async()=>({exists:()=>false}),set:(ref,value)=>writes.push({ref,value})};
 const commit=await writeEditorRefundReceipts({transaction,db:{},doc:(_,...p)=>p.join('/'),serverTimestamp:()=>42,orgId:'org',uid:'owner',items});assert.equal(writes.length,0);commit();assert.equal(writes[0].ref,'organizations/org/editorRefundReceipts/a');assert.equal(writes[0].value.digest,digest);
 assert.deepEqual(await planEditorRefundReceipts({payables:[bill]},JSON.stringify({payables:[bill]})),[]);
 await assert.rejects(planEditorRefundReceipts({payables:[{...bill,receiptImage:'data:image/jpeg;base64,ZGVm'}]},null),/match/);
 await assert.rejects(planEditorRefundReceipts({payables:[{...bill,sharedReceiptDigest:'0'.repeat(64)}]},JSON.stringify({payables:[bill]})),/replaced/);
 await assert.rejects(writeEditorRefundReceipts({transaction:{get:async()=>({exists:()=>true,data:()=>({digest,image:'data:image/jpeg;base64,ZGVm'})})},db:{},doc:()=>'',orgId:'org',uid:'owner',items}),/different/);
});
test('receipt lists are bounded and member references are not rewritten',async()=>{
 const [{planEditorRefundReceipts},{refundReceiptDigest}]=await modules();const digest=await refundReceiptDigest(image),bill={id:'a',kind:'advance',sharedReceiptKind:'editor',sharedReceiptDigest:digest,receiptImage:image};
 await assert.rejects(planEditorRefundReceipts({payables:Array.from({length:11},(_,i)=>({...bill,id:String(i)}))},null),/Too many/);
 assert.deepEqual(await planEditorRefundReceipts({payables:[{...bill,sharedReceiptKind:'member'}]},null),[]);
});
