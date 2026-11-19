'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const items=require('../refund-items.js');
test('item totals use bounded integer arithmetic with per-line half-up rounding',()=>{
 assert.equal(items.quantity('1.25'),1250);assert.equal(items.price('12.34'),1234);
 const data=[{name:'Paper',qtyMilli:1250,unitCents:1234},{name:'Pen',qtyMilli:3000,unitCents:25}];const {lines,total}=items.validate(data);assert.equal(lines[0].amountCents,1543);assert.equal(lines[1].amountCents,75);assert.equal(total,1618);assert.equal(items.parse(JSON.stringify(data)).total,total);
});
test('rejects malformed, overlarge, empty, zero or fractional-cent totals',()=>{
 for(const q of ['0','1.0001','-1','1e3','', '9999999'])assert.equal(items.quantity(q),null);
 for(const p of ['0','-1','1.234','1e3','', '99999999'])assert.equal(items.price(p),null);
 for(const list of [[],Array(21).fill({name:'x',qtyMilli:1000,unitCents:1}),[{name:'',qtyMilli:1000,unitCents:1}],[{name:'x',qtyMilli:1,unitCents:1}],[{name:'x',qtyMilli:1e9,unitCents:1e9}]])assert.throws(()=>items.validate(list));
 assert.throws(()=>items.parse('{oops'));assert.throws(()=>items.parse('x'.repeat(10001)));
});
test('both refund entry paths include an item editor while total-only remains available',()=>{const html=fs.readFileSync('index.html','utf8');assert.match(html,/id="payableRefundItemsEditor"/);assert.match(html,/id="memberRefundItemsEditor"/);assert.match(html,/Itemize this refund/);assert.match(html,/amount=itemized\?itemized.total:parseMoney/);assert.match(html,/appendRefundItems\(row,item.itemsJSON\)/);assert.match(html,/appendRefundItems\(info,bill.itemsJSON\)/);});
