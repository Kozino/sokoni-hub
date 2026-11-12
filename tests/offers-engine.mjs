// Offers pricing rules, tested directly (no database): caps, allocation across sellers, hints, code priority,
// limits, budget and the one-QAR floor. Uses the compiled engine, so run `npm run build` in api/ first.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../api/package.json',import.meta.url));
process.env.DATABASE_URL||='postgresql://postgres:postgres@127.0.0.1:5432/sokoni_test';
process.env.PGSSL='false';
process.env.JWT_SECRET||='integration-only-secret-at-least-32-characters';
const {evaluateOffers,allocate}=require('../api/dist/offers');

const base=(o)=>({
  id:o.id??'o1',code:null,title:'T',description:null,kind:'percent_off',value:10,max_discount:null,min_subtotal:0,
  scope:'all',vendor_id:null,category_id:null,fulfilment:'any',first_order_only:false,usage_limit:null,per_customer_limit:null,
  budget_total:null,starts_at:new Date(Date.now()-1000),ends_at:new Date(Date.now()+86400000),is_active:true,show_in_app:true,
  badge:null,accent:'green',priority:0,currency:'QAR',...o,
});
const leg=(v,subtotal,fee=0,mode='delivery',cat='c1')=>({vendor_id:v,mode,subtotal,delivery_fee:fee,lines:[{listing_id:'L'+v,category_id:cat,line:subtotal}]});
const run=(offers,legs,extra={})=>evaluateOffers({now:new Date(),offers,usage:extra.usage??new Map(),legs,customer:extra.customer??{known:true,has_previous_order:false},currency:'QAR',code:extra.code});
let n = 0; const ok = (c, m) => { assert(c, m); console.log('PASS', m); n++; };

// allocation always adds up
const parts = allocate(10, [60, 40, 0]); ok(parts.reduce((a, b) => a + b, 0) === 10 && parts[0] === 6 && parts[1] === 4, 'allocate 10 over 60/40 => 6 + 4');
const odd = allocate(0.05, [1, 1, 1]); ok(Math.round(odd.reduce((a, b) => a + b, 0) * 100) === 5, 'allocate 0.05 over three equal parts keeps every cent');

// percent with cap
let r = run([base({ kind: 'percent_off', value: 20, max_discount: 5 })], [leg('a', 100, 10)]);
ok(r.legs[0].discount === 5 && r.applied.length === 1, '20% capped at 5 QAR');

// fixed amount shared over two sellers
r = run([base({ kind: 'amount_off', value: 10 })], [leg('a', 60, 8), leg('b', 40, 8)]);
ok(r.legs[0].discount === 6 && r.legs[1].discount === 4, '10 QAR off shared 6/4 over a 60/40 cart');

// free delivery needs min spend (cart level) and gives hint below it
const fd = base({ kind: 'free_delivery', min_subtotal: 100 });
r = run([fd], [leg('a', 60, 8), leg('b', 60, 8)]);
ok(r.legs[0].delivery_discount === 8 && r.legs[1].delivery_discount === 8, 'free delivery over 100 waives both sellers\' fees when the cart is 120');
r = run([fd], [leg('a', 80, 8)]);
ok(r.applied.length === 0 && r.hints.length === 1 && r.hints[0].needed === 20 && /FREE delivery/.test(r.hints[0].text) && r.hints[0].progress === 0.8, 'cart 80 => hint "Add 20 QAR more for FREE delivery" at 80%');

// pickup legs get no delivery offer
r = run([base({ kind: 'free_delivery' })], [leg('a', 50, 0, 'pickup')]);
ok(r.applied.length === 0, 'free delivery never applies to a pick-up order');

// reduced delivery
r = run([base({ kind: 'delivery_percent_off', value: 50 })], [leg('a', 50, 10)]);
ok(r.legs[0].delivery_discount === 5, '50% off a 10 QAR delivery fee = 5');
r = run([base({ kind: 'delivery_amount_off', value: 30 })], [leg('a', 50, 10)]);
ok(r.legs[0].delivery_discount === 10, 'delivery amount-off never exceeds the fee');

// scope: category and vendor
r = run([base({ kind: 'percent_off', value: 10, scope: 'category', category_id: 'oil' })], [leg('a', 50, 0, 'delivery', 'oil'), leg('b', 50, 0, 'delivery', 'rice')]);
ok(r.legs[0].discount === 5 && r.legs[1].discount === 0, 'category offer discounts only matching items');
r = run([base({ kind: 'percent_off', value: 10, scope: 'vendor', vendor_id: 'b' })], [leg('a', 50), leg('b', 50)]);
ok(r.legs[0].discount === 0 && r.legs[1].discount === 5, 'vendor offer discounts only that seller');

// a coupon code beats an automatic offer of the same kind, even a bigger one
const auto = base({ id: 'auto', kind: 'percent_off', value: 30 });
const coupon = base({ id: 'cpn', code: 'SAVE5', kind: 'amount_off', value: 5 });
r = run([auto, coupon], [leg('a', 100)], { code: ' save5 ' });
ok(r.legs[0].discount === 5 && r.promo?.ok === true && r.applied[0].offer_id === 'cpn', 'typed code (any case/spacing) wins over a bigger automatic offer');
r = run([auto, coupon], [leg('a', 100)]);
ok(r.legs[0].discount === 30 && r.promo === null, 'without the code the automatic offer applies');

// goods + delivery offers combine; two goods offers do not
r = run([base({ id: 'g', kind: 'percent_off', value: 10 }), base({ id: 'd', kind: 'free_delivery' }), base({ id: 'g2', kind: 'amount_off', value: 3 })], [leg('a', 100, 8)]);
ok(r.legs[0].discount === 10 && r.legs[0].delivery_discount === 8 && r.applied.length === 2, 'one goods offer + one delivery offer combine; the lesser goods offer is not stacked');

// unknown / inactive / expired codes
r = run([], [leg('a', 100)], { code: 'NOPE' });
ok(r.promo?.ok === false && /not valid/.test(r.promo.message || ''), 'unknown code is rejected with a clear message');
r = run([base({ code: 'OLD', ends_at: new Date(Date.now() - 1000), starts_at: new Date(Date.now() - 5000) })], [leg('a', 100)], { code: 'OLD' });
ok(r.promo?.ok === false && /ended/.test(r.promo.message || ''), 'expired code says it has ended');
r = run([base({ code: 'DRAFT', is_active: false })], [leg('a', 100)], { code: 'DRAFT' });
ok(r.promo?.ok === false && /not valid/.test(r.promo.message || ''), 'a draft/paused code looks like an invalid code (nothing leaks)');

// limits
r = run([base({ code: 'ONE', per_customer_limit: 1 })], [leg('a', 100)], { code: 'ONE', usage: new Map([['o1', { used_total: 3, used_by_customer: 1, spent_total: 0 }]]) });
ok(r.promo?.ok === false && /already used/.test(r.promo.message || ''), 'per-customer limit stops a second use');
r = run([base({ code: 'TEN', usage_limit: 10 })], [leg('a', 100)], { code: 'TEN', usage: new Map([['o1', { used_total: 10, used_by_customer: 0, spent_total: 0 }]]) });
ok(r.promo?.ok === false && /fully claimed/.test(r.promo.message || ''), 'total usage limit stops the offer');
r = run([base({ kind: 'percent_off', value: 10, budget_total: 20 })], [leg('a', 100)], { usage: new Map([['o1', { used_total: 1, used_by_customer: 0, spent_total: 13 }]]) });
ok(r.legs[0].discount === 7, 'budget 20 with 13 already funded caps this discount at the 7 that remain');
r = run([base({ kind: 'percent_off', value: 10, budget_total: 20 })], [leg('a', 100)], { usage: new Map([['o1', { used_total: 1, used_by_customer: 0, spent_total: 20 }]]) });
ok(r.applied.length === 0, 'a spent budget switches the offer off');
r = run([base({ code: 'NEW', first_order_only: true })], [leg('a', 100)], { code: 'NEW', customer: { known: true, has_previous_order: true } });
ok(r.promo?.ok === false && /first orders/.test(r.promo.message || ''), 'first-order-only refuses a returning customer');
r = run([base({ code: 'NEW', first_order_only: true })], [leg('a', 100)], { code: 'NEW', customer: { known: false, has_previous_order: false } });
ok(r.promo?.ok === true, 'an unknown customer is not blocked at quote time (checkout enforces with the real phone)');

// the one-QAR floor: a rider always has cash to collect
r = run([base({ kind: 'percent_off', value: 100 })], [leg('a', 20, 8)]);
ok(r.legs[0].discount === 20 && r.legs[0].delivery_discount === 0, '100% off the goods of a 20 + 8 order leaves the 8 QAR delivery fee payable (floor not triggered)');
r = run([base({ id: 'g', kind: 'percent_off', value: 100 }), base({ id: 'd', kind: 'free_delivery' })], [leg('a', 20, 8)]);
const total = 20 + 8 - r.legs[0].discount - r.legs[0].delivery_discount;
ok(total === 1, `100% off + free delivery leaves exactly 1 QAR payable (got ${total})`);
ok(r.applied.reduce((s, a) => s + a.goods_discount + a.delivery_discount, 0) === r.legs[0].discount + r.legs[0].delivery_discount, 'the recorded redemptions match the trimmed discount to the cent');

// a currency mismatch never applies
r = run([base({ currency: 'USD' })], [leg('a', 100)]);
ok(r.applied.length === 0, 'an offer in another currency never applies');
console.log(`\n${n} engine checks passed`);
