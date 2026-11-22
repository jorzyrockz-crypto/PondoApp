'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const evaluate=require('./quick-action-evaluator.cjs');
const examples=require('./fixtures/quick-action-evaluation.cjs'),additional=require('./fixtures/quick-action-additional.cjs');
function measure(cases){let top=0,listed=0;for(const [query,id] of cases){const result=evaluate(query);if(result.ids[0]===id)top++;if(result.ids.includes(id))listed++;else assert.fail(`${query}: expected ${id}, got ${result.ids.join(', ')} (${result.kind})`)}return {top,listed}}
test('curated synthetic searches cover all action purposes',()=>{
 assert.equal(new Set(examples.map(([,id])=>id)).size,15);
 const result=measure(examples);assert.equal(result.top,examples.length);assert.equal(result.listed,examples.length);
});
test('additional synthetic wording retains top and listed accuracy',()=>{
 assert.equal(new Set(additional.map(([,id])=>id)).size,15);
 const result=measure(additional);assert.equal(result.listed,additional.length);assert.equal(result.top,additional.length);
});
test('unknown queries, word boundaries, financial distinctions and permissions remain safe',()=>{
 assert.deepEqual(Array.from(evaluate('track a secret spacecraft').ids),['other']);assert.equal(evaluate('track a secret spacecraft').kind,'fallback');
 assert.ok(!evaluate('fund').ids.includes('refund'),'fund must not match the middle of refund');
 assert.equal(evaluate('supplier bill has not been paid').ids[0],'unpaid');
 assert.ok(!evaluate('I paid a bill').ids.includes('unpaid'));
 assert.ok(!evaluate('unpaid purchase').ids.includes('expense'));
 assert.equal(evaluate('member has not paid contributions').ids[0],'contribution');
 assert.ok(!evaluate('hindi pa bayad na kontribusyon').ids.includes('unpaid'));
 assert.equal(evaluate('member paid a contribution').ids[0],'contribution');
 assert.deepEqual(Array.from(evaluate('request account balance').ids),['fund-balance','member-balance']);
 assert.deepEqual(Array.from(evaluate('financial statement').ids),['cash-report','member-statement']);
 assert.deepEqual(Array.from(evaluate('record income',['fund-balance','cash-report']).ids),[]);
 assert.deepEqual(Array.from(evaluate('unrecognized zebras',['fund-balance','cash-report']).ids),[]);
});
