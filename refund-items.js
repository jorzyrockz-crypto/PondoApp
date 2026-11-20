// Exact, bounded refund line-item arithmetic. Stored amounts are centavos and
// quantities are thousandths; half-cent amounts round up on each line.
(function(root){
 'use strict';
 const MAX_TOTAL=1000000000, MAX_ITEMS=20;
 function quantity(value){
  const text=String(value).trim();if(!/^\d{1,7}(?:\.\d{1,3})?$/.test(text))return null;
  const [whole,frac='']=text.split('.'),n=Number(whole)*1000+Number((frac+'000').slice(0,3));return Number.isSafeInteger(n)&&n>0&&n<=1000000000?n:null;
 }
 function price(value){
  const text=String(value).trim();if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(text))return null;
  const [whole,frac='']=text.split('.'),n=Number(whole)*100+Number((frac+'00').slice(0,2));return Number.isSafeInteger(n)&&n>0&&n<=MAX_TOTAL?n:null;
 }
 function validate(items){
  if(!Array.isArray(items)||!items.length||items.length>MAX_ITEMS)throw Error('Add between 1 and 20 refund items.');
  let total=0;const lines=items.map(item=>{
   if(!item||Object.keys(item).sort().join(',')!=='name,qtyMilli,unitCents'||typeof item.name!=='string'||!item.name.trim()||item.name.length>120||!Number.isSafeInteger(item.qtyMilli)||item.qtyMilli<=0||item.qtyMilli>1000000000||!Number.isSafeInteger(item.unitCents)||item.unitCents<=0||item.unitCents>MAX_TOTAL)throw Error('Enter each item, a positive quantity and a valid unit price.');
   const product=item.qtyMilli*item.unitCents;if(!Number.isSafeInteger(product)||product>Number.MAX_SAFE_INTEGER-500)throw Error('Item amount is too large.');
   const amountCents=Math.floor((product+500)/1000);if(amountCents<=0||amountCents>MAX_TOTAL)throw Error('Each item amount must be between 0.01 and 10,000,000.');
   total+=amountCents;if(total>MAX_TOTAL)throw Error('The refund total cannot exceed 10,000,000.');return {...item,amountCents};
  });return {lines,total};
 }
 function parse(json){if(typeof json!=='string'||json.length>10000)throw Error('Invalid refund items.');let items;try{items=JSON.parse(json)}catch(e){throw Error('Invalid refund items.')}return validate(items)}
 const api={quantity,price,validate,parse,MAX_ITEMS};root.PondoRefundItems=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
