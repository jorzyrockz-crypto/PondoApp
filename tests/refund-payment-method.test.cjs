const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function previousRefundPaymentMethod('),html.indexOf('function openPayablePayment('));
function lookup(txs,bill={id:'r1',kind:'advance'}){const c={txs,bill};vm.createContext(c);vm.runInContext(source,c);return c.previousRefundPaymentMethod(bill)}
test('suggests the most recent recorded method for this refund only',()=>{
 const txs=[{payableId:'r1',type:'OUT',date:'2026-01-01',method:'Cash'},{payableId:'r2',type:'OUT',date:'2026-04-01',method:'Other refund'},{payableId:'r1',type:'IN',date:'2026-05-01',method:'Income'},{payableId:'r1',type:'OUT',date:'2026-02-01',method:' Bank transfer '},{payableId:'r1',type:'OUT',date:'2026-03-01',receiptNo:'UNIQUE-VOUCHER'}];
 assert.equal(lookup(txs),'Bank transfer');assert.equal(lookup([{payableId:'r1',type:'OUT',date:'2026-01-01',method:'Cash'},{payableId:'r1',type:'OUT',date:'2026-01-01',method:'GCash'}]),'GCash');
});
test('does not infer a payment method from a voucher or unrelated records',()=>{
 assert.equal(lookup([{payableId:'r1',type:'OUT',receiptNo:'Cash / voucher 123'}]),'');
 assert.equal(lookup([{payableId:'r2',type:'OUT',method:'Cash'}]),'');
 assert.equal(lookup([{payableId:'r1',type:'OUT',method:'Cash'}],{id:'r1',kind:'supplier'}),'');
});
test('method and unique reference are separate, editable, and stored separately',()=>{
 assert.match(html,/id="paymentMethod"[^>]*aria-describedby="paymentMethodHint"/);
 assert.match(html,/Suggested from a previous payment on this refund/);
 assert.match(html,/id="paymentRef"/);
 const open=html.slice(html.indexOf('function openPayablePayment('),html.indexOf('function closePayableModal('));
 assert.match(open,/paymentMethod'\)\.value=previousMethod/);assert.match(open,/paymentRef'\)\.value=''/);
 const save=html.slice(html.indexOf('async function savePayablePayment()'),html.indexOf('async function deleteUnpaidPayable('));
 assert.match(save,/receiptNo:document\.getElementById\('paymentRef'\)\.value\.trim\(\)/);
 assert.match(save,/method:document\.getElementById\('paymentMethod'\)\.value\.trim\(\)/);
});
