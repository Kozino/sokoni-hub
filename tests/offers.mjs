// Offers: platform-funded discounts, coupon codes, free and reduced delivery, admin controls, campaign push.
// Uses an isolated PostgreSQL *_test database and starts the built API (run `npm run build` in api/ first).
//
// The point of this file is the money. Every discount is funded by Sokoni Hub, so it checks that:
//   - the buyer pays the discounted total, and the rider collects exactly that;
//   - the vendor's wallet credit and statements still use the FULL goods value;
//   - the rider still earns the FULL delivery fee, even when delivery was free for the buyer;
//   - clients that do not opt in (the web storefront, older app builds) are priced exactly as before;
//   - limits hold under a race, and campaign pushes never reach vendor or rider devices.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const require=createRequire(new URL('../api/package.json',import.meta.url));
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
if(!['127.0.0.1','localhost','postgres'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw Error('Only isolated *_test databases allowed');
if(process.env.NODE_ENV==='production')throw Error('Never test against production');
process.env.PGSSL='false';
process.env.JWT_SECRET ||= 'integration-only-secret-at-least-32-characters';
process.env.PIN_PEPPER ||= 'integration-only-pepper-at-least-32-characters';
process.env.MFA_ENCRYPTION_KEY ||= 'ab'.repeat(32);
process.env.SUPABASE_URL='http://127.0.0.1:9';
const PORT=String(4900+Math.floor(Math.random()*90));
const BASE=`http://127.0.0.1:${PORT}`;
const {pool,one,query}=require('../api/dist/db');
const {signToken}=require('../api/dist/auth');
const {publicUrlFor}=require('../api/dist/storage');
const {config}=require('../api/dist/config');
const {computeStatement}=require('../api/dist/billing');
const {receiptEmailHtml}=require('../api/dist/templates');
const bcrypt=require('bcryptjs');

let count=0;
const ok=(v,m)=>{assert(v,m);console.log('PASS',m);count++;};
const eq=(a,b,m)=>{assert.equal(a,b,`${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);console.log('PASS',m);count++;};
const num=(v)=>Math.round(Number(v)*100)/100;
const rnd=()=>randomUUID().replace(/-/g,'').slice(0,6).toUpperCase();

// ---- a stand-in for Expo's push service: records every message it is asked to deliver
const pushes=[];
const stub=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
  const msgs=JSON.parse(b||'[]');pushes.push(...msgs);res.setHeader('content-type','application/json');
  res.end(JSON.stringify({data:msgs.map((m)=>/dead/.test(m.to)?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok'})}));});});
await new Promise((r)=>stub.listen(0,'127.0.0.1',r));
const STUB=`http://127.0.0.1:${stub.address().port}/send`;

const server=spawn(process.execPath,['dist/server.js'],{cwd:new URL('../api/',import.meta.url).pathname,env:{...process.env,PORT,NODE_ENV:'development',EXPO_PUSH_URL:STUB},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
async function waitForServer(){
  for(let i=0;i<60;i++){try{const r=await fetch(`${BASE}/api/health`);if(r.status<500)return;}catch{}await new Promise(r=>setTimeout(r,500));}
  throw new Error('API did not start:\n'+serverLog.slice(-2000));
}
async function call(method,path,token,body){
  const r=await fetch(`${BASE}${path}`,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,body:json};
}

// Qatar: store, and a delivery pin about 100 m away (inside the geofence)
const STORE={lat:25.2854,lng:51.531};
const PIN={lat:25.2854+0.0009,lng:51.531};
const resetLimits=()=>query('delete from security_rate_limits');
const phone=()=>'974'+String(Math.floor(10000000+Math.random()*89999999));

const pw=await bcrypt.hash('x',4);
async function mkUser(role,name){
  const p=phone();
  const u=await one(`insert into users(full_name,phone,email,password_hash,role) values($1,$2,$3,$4,$5) returning id`,[name,p,randomUUID()+'@example.invalid',pw,role]);
  return {id:u.id,phone:p,token:await signToken(u.id,role)};
}
async function mkVendor(name){
  const u=await mkUser('vendor',name);
  const v=await one(`insert into vendors(user_id,business_name,slug,whatsapp,country,city,status,lat,lng) values($1,$2,$3,'97400000000','QA','Doha','verified',$4,$5) returning id`,
    [u.id,name,'offers-'+randomUUID().slice(0,8),STORE.lat,STORE.lng]);
  await query(`insert into vendor_delivery_settings(vendor_id,offers_pickup,offers_delivery,delivery_fee) values($1,true,true,10)`,[v.id]);
  return {id:v.id,userId:u.id,token:u.token};
}
async function mkListing(vendor,cat,title,price){
  return (await one(`insert into listings(vendor_id,category_id,kind,title,slug,price,currency,status) values($1,$2,'product',$3,$4,$5,'QAR','active') returning id`,
    [vendor.id,cat,title,'t-'+randomUUID().slice(0,10),price])).id;
}
async function mkRider(){
  const u=await mkUser('driver','Offers rider');
  await query(`insert into drivers(user_id,status,vehicle_type,license_plate,is_online,current_lat,current_lng) values($1,'approved','Motorbike',$2,true,$3,$4)`,[u.id,'O-'+rnd(),PIN.lat,PIN.lng]);
  return u;
}
async function activeRate(){
  const m=await one(`select value from system_settings where key='money_model'`);
  if(m?.value?.commission_enabled!==true)return 0;
  return Number((await one('select commission_rate from platform_settings where id=true')).commission_rate??0);
}

const NOW=Date.now();
const iso=(ms)=>new Date(NOW+ms).toISOString();
const DAY=86400000;
let admin;
async function mkOffer(over={},{activate=false}={}){
  const body={title:'Test offer '+rnd(),kind:'percent_off',value:10,min_subtotal:0,scope:'all',fulfilment:'any',first_order_only:false,
    show_in_app:true,accent:'green',priority:0,starts_at:iso(-3600000),ends_at:iso(30*DAY),...over};
  const r=await call('POST','/api/offers/admin',admin.token,body);
  if(r.status!==201)throw new Error('offer create failed: '+JSON.stringify(r.body));
  if(activate){const a=await call('POST',`/api/offers/admin/${r.body.offer.id}/activate`,admin.token,{});if(a.status!==200)throw new Error('activate failed '+JSON.stringify(a.body));return a.body.offer;}
  return r.body.offer;
}
const switchOffEverything=()=>query('update offers set is_active=false');
const checkout=(token,{items,mode='delivery',code,tel,offers=true,expected,name='Offers Buyer'})=>call('POST','/api/orders/checkout',token,{
  request_id:randomUUID(),items,contact_name:name,contact_phone:tel,delivery_address:'Building 1, Street 2, Zone 3',delivery_lat:PIN.lat,delivery_lng:PIN.lng,
  city:'Doha',country:'Qatar',fulfilment_mode:mode,...(offers?{offers:true}:{}),...(code?{promo_code:code}:{}),...(expected!==undefined?{expected_total:expected}:{})});
const quote=(token,{items,mode='delivery',code,offers=true,tel})=>call('POST','/api/orders/quote',token,{items,fulfilment_mode:mode,...(offers?{offers:true}:{}),...(code?{promo_code:code}:{}),...(tel?{contact_phone:tel}:{})});
const orderRow=(id)=>one('select * from orders where id=$1',[id]);

/** Vendor confirms and dispatches, the rider drives it through to a completed drop-off with cash collected. */
async function deliverByRider(orderId,vendor,rider){
  assert.equal((await call('PATCH',`/api/orders/vendor/${orderId}/status`,vendor.token,{status:'confirmed'})).status,200,'vendor confirms');
  assert.equal((await call('PATCH',`/api/orders/vendor/${orderId}/status`,vendor.token,{status:'dispatched'})).status,200,'vendor dispatches');
  const acc=await call('POST',`/api/drivers/orders/${orderId}/accept`,rider.token,{});assert.equal(acc.status,200,'rider accepts '+JSON.stringify(acc.body));
  assert.equal((await call('POST',`/api/drivers/orders/${orderId}/arrive`,rider.token,STORE)).status,200,'rider arrives at the store');
  assert.equal((await call('POST',`/api/drivers/orders/${orderId}/pickup`,rider.token,STORE)).status,200,'rider picks up');
  const proof=publicUrlFor(config.supabaseBucket,`${rider.id}/`)+randomUUID()+'.jpg';
  return call('POST',`/api/drivers/orders/${orderId}/complete`,rider.token,{proof_url:proof,lat:PIN.lat,lng:PIN.lng,cash_collected:true});
}
const ledger=async(orderId,kind)=>{const r=await one('select amount from driver_ledger where order_id=$1 and kind=$2',[orderId,kind]);return r?num(r.amount):null;};
const wallet=async(vendorId)=>{const w=await one('select wallet_pending,wallet_available from vendors where id=$1',[vendorId]);return {pending:num(w.wallet_pending),available:num(w.wallet_available)};};

try{
  await waitForServer();

  // ------------------------------------------------------------------ fixtures
  const cats=(await query(`select id from categories where kind='product' and not is_banned order by name limit 2`));
  assert(cats.length===2,'two product categories are seeded');
  const [catA,catB]=[cats[0].id,cats[1].id];
  const vendorA=await mkVendor('Offers store A');
  const vendorB=await mkVendor('Offers store B');
  const A1=await mkListing(vendorA,catA,'Palm oil 60',60);
  const B1=await mkListing(vendorB,catB,'Rice 40',40);
  const A2=await mkListing(vendorA,catA,'Cheap item 5',5);
  const rider=await mkRider();
  admin=await mkUser('admin','Offers admin');
  const buyer=await mkUser('buyer','Offers buyer');
  const buyerTel=buyer.phone;
  await switchOffEverything();
  await resetLimits();
  const cartA=[{listing_id:A1,qty:1}];
  const cartAB=[{listing_id:A1,qty:1},{listing_id:B1,qty:1}];

  // ================================================================== 1. admin access and validation
  ok((await call('GET','/api/offers/admin')).status===401,'admin offers need a sign-in');
  ok((await call('GET','/api/offers/admin',buyer.token)).status===403,'a customer cannot open the admin offers');
  ok((await call('POST','/api/offers/admin',buyer.token,{})).status===403,'a customer cannot create an offer');
  const good={title:'Valid',kind:'percent_off',value:10,starts_at:iso(-1000),ends_at:iso(DAY)};
  ok((await call('POST','/api/offers/admin',admin.token,{...good,value:150})).status===400,'a percentage above 100 is refused');
  ok((await call('POST','/api/offers/admin',admin.token,{...good,kind:'amount_off',value:0})).status===400,'an amount of zero is refused');
  ok((await call('POST','/api/offers/admin',admin.token,{...good,scope:'vendor'})).status===400,'a store offer without a store is refused');
  ok((await call('POST','/api/offers/admin',admin.token,{...good,kind:'free_delivery',fulfilment:'pickup'})).status===400,'free delivery cannot be limited to store collection');
  ok((await call('POST','/api/offers/admin',admin.token,{...good,ends_at:iso(-5000)})).status===400,'an end before the start is refused');
  ok((await call('POST','/api/offers/admin',admin.token,{...good,starts_at:iso(-3*DAY),ends_at:iso(-DAY)})).status===400,'an offer that has already ended cannot be created');
  ok((await call('POST','/api/offers/admin',admin.token,{...good,code:'a b'})).status===400,'a code with spaces or too short is refused');

  // ================================================================== 2. created OFF, live only when switched on
  const codeW=`W10${rnd()}`;
  const welcome=await mkOffer({title:'10% off, up to 5 QAR',code:codeW.toLowerCase(),kind:'percent_off',value:10,max_discount:5,min_subtotal:50,per_customer_limit:1});
  eq(welcome.state,'draft','a new offer is created as a draft');
  eq(welcome.code,codeW,'its code is stored in capitals');
  ok((await call('GET','/api/offers')).body.offers.every((o)=>o.id!==welcome.id),'a draft is not listed in the app');
  let q=await quote(buyer.token,{items:cartA,code:codeW});
  ok(q.body.promo?.ok===false&&/not valid/.test(q.body.promo.message),'a draft code is refused as "not valid" (nothing leaks)');
  const dup=await call('POST','/api/offers/admin',admin.token,{...good,code:codeW});
  eq(dup.status,409,'the same code cannot be used twice');
  const freeDel=await mkOffer({title:'Free delivery over 100',kind:'free_delivery',min_subtotal:100});
  await call('POST',`/api/offers/admin/${welcome.id}/activate`,admin.token,{});
  await call('POST',`/api/offers/admin/${freeDel.id}/activate`,admin.token,{});
  const listed=(await call('GET','/api/offers')).body.offers;
  const mine=listed.find((o)=>o.id===welcome.id);
  ok(!!mine&&mine.code===codeW&&mine.link==='sokonihub://browse'&&!('usage_limit' in mine)&&!('budget_total' in mine),'once switched on it is listed, without leaking its limits or budget');
  ok(listed.find((o)=>o.id===freeDel.id)?.auto===true,'an automatic offer is listed as automatic');

  // ================================================================== 3. clients that do not opt in are priced exactly as before
  q=await quote(buyer.token,{items:cartA,offers:false});
  ok(q.status===200&&q.body.total===70&&q.body.discount===undefined&&q.body.applied_offers===undefined,'a quote without the offers flag is the legacy shape and total, even with live offers');
  q=await quote(buyer.token,{items:cartAB,offers:false});
  ok(q.body.total===120&&q.body.delivery_fee===20,'a two-store cart without the flag is unchanged (120)');
  const legacy=await checkout(buyer.token,{items:cartA,offers:false,tel:buyerTel});
  ok(legacy.status===201&&legacy.body.orders[0].total===70&&legacy.body.orders[0].discount===0&&legacy.body.orders[0].delivery_discount===0,'a legacy checkout is charged in full (discount fields are simply 0)');
  let legacyRow=await orderRow(legacy.body.orders[0].id);
  ok(num(legacyRow.total)===70&&num(legacyRow.discount)===0&&num(legacyRow.delivery_discount)===0&&legacyRow.promo_code===null,'and its order row has zero discount');
  await call('POST','/api/orders/track/cancel',null,{code:legacyRow.code,phone:buyerTel});

  // ================================================================== 4. pricing for clients that do opt in
  q=await quote(buyer.token,{items:cartA});
  ok(q.body.discount===0&&q.body.applied_offers.length===0&&q.body.total===70,'60 QAR cart: no offer applies yet');
  ok(q.body.hints.length===1&&q.body.hints[0].needed===40&&/FREE delivery/.test(q.body.hints[0].text)&&q.body.hints[0].progress===0.6,'it is told "Add 40 QAR more for FREE delivery" (60% there)');
  q=await quote(buyer.token,{items:cartA,code:` ${codeW.toLowerCase()} `});
  ok(q.body.promo?.ok===true&&q.body.discount===5&&q.body.total===65&&q.body.subtotal===60&&q.body.delivery_fee===10,'the code (any case, with spaces) takes 10% capped at 5: pays 65');
  q=await quote(buyer.token,{items:cartAB});
  ok(q.body.delivery_discount===20&&q.body.total===100&&q.body.delivery_fee===20,'a 100 QAR two-store cart gets free delivery on both stores: pays 100');
  ok(q.body.vendors.length===2&&q.body.vendors.every((v)=>v.delivery_discount===10)&&q.body.vendors.find((v)=>v.vendor_id===vendorA.id).total===60,'each store shows its own delivery discount and total');
  q=await quote(buyer.token,{items:cartA,mode:'pickup',code:codeW});
  ok(q.body.discount===5&&q.body.delivery_fee===0&&q.body.total===55,'store collection: the code still applies, there is no delivery fee to reduce');
  q=await quote(buyer.token,{items:cartA,code:'NOSUCHCODE'});
  ok(q.status===200&&q.body.promo.ok===false&&q.body.total===70,'an unknown code gives a message and the normal price, not an error');
  q=await quote(null,{items:cartA,code:codeW});
  ok(q.body.promo?.ok===true&&q.body.total===65,'a guest can see the code work');
  // guessing codes is throttled, but only wrong guesses count: valid codes can be re-quoted all day
  await resetLimits();
  for(let i=0;i<30;i++)await quote(buyer.token,{items:cartA,code:codeW});
  ok((await quote(buyer.token,{items:cartA,code:codeW})).status===200,'a valid code can be re-quoted over and over without being throttled');
  for(let i=0;i<60;i++)await quote(buyer.token,{items:cartA,code:'GUESS'+i});
  const wrongNow=await quote(buyer.token,{items:cartA,code:'GUESS-AFTER'});
  const rightNow=await quote(buyer.token,{items:cartA,code:codeW});
  ok(wrongNow.status===200&&rightNow.status===200&&wrongNow.body.promo.message===rightNow.body.promo.message&&/Too many wrong codes/.test(rightNow.body.promo.message),'after 60 wrong guesses a right code and a wrong one get the SAME answer, so guessing reveals nothing');
  ok(rightNow.body.promo.ok===false&&rightNow.body.discount===0&&rightNow.body.total===70,'the code is ignored while throttled, but the cart is still priced normally (it never breaks)');
  const blockedCheckout=await checkout(buyer.token,{items:cartA,code:codeW,tel:buyerTel});
  eq(blockedCheckout.status,429,'checkout cannot be used to test codes while throttled either');
  eq((await quote(buyer.token,{items:cartA})).status,200,'a quote with no code is unaffected');
  await resetLimits();
  eq((await quote(buyer.token,{items:cartA,code:codeW})).body.promo.ok,true,'everything is back to normal once the window clears');

  // ================================================================== 5. THE MONEY: a discounted delivery, end to end
  await resetLimits();
  const walletBefore=await wallet(vendorA.id);
  const rate=await activeRate();
  const co=await checkout(buyer.token,{items:cartA,code:codeW,tel:buyerTel,expected:65});
  eq(co.status,201,'checkout with the code succeeds');
  const o1=co.body.orders[0];
  ok(o1.total===65&&o1.discount===5&&o1.subtotal===60&&o1.delivery_fee===10,'the response shows subtotal 60, fee 10, discount 5, total 65');
  const r1=await orderRow(o1.id);
  ok(num(r1.subtotal)===60&&num(r1.delivery_fee)===10,'the order keeps the FULL subtotal and delivery fee (what the vendor and rider are paid from)');
  ok(num(r1.discount)===5&&num(r1.delivery_discount)===0&&num(r1.total)===65&&r1.promo_code===codeW,'and records the discount beside them; total is what the buyer pays');
  ok(Array.isArray(r1.offers_applied)&&r1.offers_applied.length===1&&r1.offers_applied[0].title==='10% off, up to 5 QAR','a snapshot of the applied offer is kept on the order');
  const red=await one('select * from offer_redemptions where order_id=$1',[o1.id]);
  ok(red&&num(red.goods_discount)===5&&red.user_id===buyer.id&&red.phone_key===buyerTel,'one redemption row records who used it and what it cost');
  let bad=null;try{await query('update orders set total=999 where id=$1',[o1.id]);}catch(e){bad=e;}
  ok(bad?.code==='23514','the database refuses an order whose total does not add up');
  const trk=await call('GET',`/api/orders/track?code=${r1.code}&phone=${buyerTel}`);
  ok(trk.body.order.discount==='5.00'||Number(trk.body.order.discount)===5,'the buyer\'s tracking page carries the discount');
  ok(trk.body.order.promo_code===codeW&&Array.isArray(trk.body.order.offers_applied),'with the code and the offers applied');

  // the vendor sees the order and is still credited in full
  const vOrders=await call('GET','/api/orders/vendor',vendorA.token);
  const seen=vOrders.body.orders.find((o)=>o.id===o1.id);
  ok(seen&&num(seen.total)===65&&num(seen.subtotal)===60&&num(seen.delivery_fee)===10,'the vendor app receives the same fields it always did (total 65 = what the buyer pays)');
  const done=await deliverByRider(o1.id,vendorA,rider);
  eq(done.status,200,'the rider completes the delivery');
  eq(await ledger(o1.id,'cash_collected'),65,'RIDER: the cash they collected is the discounted 65, which is what the driver app asked for');
  eq(await ledger(o1.id,'fee_earned'),10,'RIDER: still earns the full 10 QAR delivery fee');
  const r1b=await orderRow(o1.id);
  const expectCommission=num(60*rate);
  eq(num(r1b.vendor_amount),num(60-expectCommission),'VENDOR: credited the full 60 goods value (less only the normal commission), not 55');
  eq(num(r1b.driver_amount),10,'RIDER: driver_amount is the full delivery fee');
  const w1=await wallet(vendorA.id);
  eq(num(w1.pending-walletBefore.pending),num(60-expectCommission),'VENDOR: wallet pending rose by the full goods value');
  eq((await call('POST','/api/orders/track/confirm',null,{code:r1b.code,phone:buyerTel})).status,200,'the buyer confirms receipt');
  const w2=await wallet(vendorA.id);
  eq(num(w2.available-walletBefore.available),num(60-expectCommission),'VENDOR: the same amount becomes available for payout');
  const dash=await call('GET','/api/vendors/dashboard',vendorA.token);
  const stats=dash.body.stats||dash.body;
  const expectedRevenue=num((await one(`select coalesce(sum(subtotal+delivery_fee),0) s from orders where vendor_id=$1 and status not in ('cancelled')`,[vendorA.id])).s);
  eq(num(stats.revenue_pipeline),expectedRevenue,'VENDOR: dashboard revenue counts the full order value (70), unaffected by the discount');

  // ================================================================== 6. one store per checkout; free delivery still pays the rider in full
  await resetLimits();
  const buyer2=await mkUser('buyer','Second buyer');
  const mixed=await checkout(buyer2.token,{items:cartAB,tel:buyer2.phone,expected:100});
  eq(mixed.status,422,'a mixed-store cart cannot be placed as one checkout');
  const co2=await checkout(buyer2.token,{items:[{listing_id:A1,qty:2}],tel:buyer2.phone,expected:120});
  eq(co2.status,201,'a single-store cart that meets free delivery is placed');
  eq(co2.body.orders.length,1,'one store is one order');
  const oA=co2.body.orders[0];
  ok(oA.vendor_id===vendorA.id&&oA.total===120&&oA.delivery_discount===10&&oA.delivery_fee===10,'full fee recorded, delivery discount 10, buyer pays 120');
  const feeOffer=await one(`select count(*)::int rows, count(distinct checkout_key)::int uses from offer_redemptions where offer_id=$1`,[freeDel.id]);
  ok(feeOffer.rows===1&&feeOffer.uses===1,'the free-delivery offer is used once on that order');
  const doneA=await deliverByRider(oA.id,vendorA,rider);
  eq(doneA.status,200,'the rider completes the free-delivery order');
  eq(await ledger(oA.id,'cash_collected'),120,'RIDER: collected 120 (the buyer paid no delivery)');
  eq(await ledger(oA.id,'fee_earned'),10,'RIDER: earned the full 10 even though delivery was free for the buyer');
  await call('POST','/api/orders/track/confirm',null,{code:(await orderRow(oA.id)).code,phone:buyer2.phone});
  const walletA3=await wallet(vendorA.id);
  ok(walletA3.available>w2.available,'VENDOR: the free-delivery order also released the full goods value');

  // ================================================================== 7. vendor-held cash (store collection): the statement credits the discount
  await resetLimits();
  const buyer3=await mkUser('buyer','Pickup buyer');
  const pk=await checkout(buyer3.token,{items:cartA,mode:'pickup',code:codeW,tel:buyer3.phone,expected:55});
  eq(pk.status,201,'a store-collection order with the code is placed');
  const op=pk.body.orders[0];
  ok(op.total===55&&op.delivery_fee===0&&op.discount===5,'the buyer pays 55 at the counter');
  assert.equal((await call('PATCH',`/api/orders/vendor/${op.id}/status`,vendorA.token,{status:'confirmed'})).status,200);
  assert.equal((await call('PATCH',`/api/orders/vendor/${op.id}/status`,vendorA.token,{status:'delivered'})).status,200);
  eq((await call('POST','/api/orders/track/confirm',null,{code:(await orderRow(op.id)).code,phone:buyer3.phone})).status,200,'the buyer confirms collection');
  eq((await orderRow(op.id)).funds_collected_by,'vendor','the vendor held the cash');
  const month=new Date(Date.now()+3*3600000).toISOString().slice(0,7);
  const prev=await call('POST','/api/billing/statements/preview',admin.token,{month,vendor_id:vendorA.id});
  eq(prev.status,200,'the statement preview runs');
  const vs=prev.body.vendors.find((v)=>v.vendor_id===vendorA.id);
  ok(vs&&vs.gross_sales===60,'STATEMENT: gross sales are the full 60');
  eq(vs.collected_by_vendor,55,'STATEMENT: the vendor actually collected 55');
  const expectedBalance=num(60-num(60*prev.body.commission_rate)-55);
  eq(num(vs.net_due_to_vendor-vs.net_due_to_platform),expectedBalance,'STATEMENT: the balance credits the vendor the 5 that Sokoni Hub funded (net of normal commission)');
  const unit=computeStatement([{id:'x',subtotal:100,delivery_fee:0,total:80,funds_collected_by:'vendor',goods_subtotal:100,discount:20}],0.1);
  ok(unit.collected_by_vendor===80&&unit.net_due_to_vendor===10&&unit.net_due_to_platform===0,'STATEMENT: 100 sold, 20 funded by Sokoni Hub, 10% commission => vendor is owed 10');
  const old=computeStatement([{id:'x',subtotal:100,delivery_fee:0,total:100,funds_collected_by:'vendor',goods_subtotal:100}],0.1);
  ok(old.collected_by_vendor===100&&old.net_due_to_platform===10,'STATEMENT: with no discount nothing changes (vendor owes the 10 commission)');

  // ================================================================== 8. limits
  await resetLimits();
  const again=await checkout(buyer.token,{items:cartA,code:codeW,tel:buyerTel});
  ok(again.status===409&&/already used/.test(again.body.error),'the same customer cannot use a once-only code twice');
  const sameNumber='+974 '+buyerTel.slice(3,7)+' '+buyerTel.slice(7);
  const guestTry=await checkout(null,{items:cartA,code:codeW,tel:sameNumber});
  ok(guestTry.status===409&&/already used/.test(guestTry.body.error),'a guest using the same phone number (any format) is stopped too');
  eq((await call('GET','/api/offers',buyer.token)).body.offers.some((o)=>o.id===welcome.id),false,'the app no longer lists a once-only offer to a customer who used it');
  eq((await call('GET','/api/offers')).body.offers.some((o)=>o.id===welcome.id),true,'but still lists it to everyone else');

  // a cancelled order frees its use (nothing runs in the background to do this)
  const cx=await mkOffer({code:'CXL'+rnd(),kind:'amount_off',value:10,per_customer_limit:1},{activate:true});
  const bc=await mkUser('buyer','Cancel buyer');
  const c1=await checkout(bc.token,{items:cartA,code:cx.code,tel:bc.phone});
  eq(c1.status,201,'first use of a once-only code works');
  eq((await checkout(bc.token,{items:cartA,code:cx.code,tel:bc.phone})).status,409,'a second use is refused');
  eq((await call('POST','/api/orders/track/cancel',null,{code:(await orderRow(c1.body.orders[0].id)).code,phone:bc.phone})).status,200,'the buyer cancels the pending order');
  eq((await checkout(bc.token,{items:cartA,code:cx.code,tel:bc.phone})).status,201,'cancelling frees the use: the code works again');
  await call('POST',`/api/offers/admin/${cx.id}/pause`,admin.token,{});

  // total usage limit under a race: exactly one of two simultaneous checkouts wins
  await resetLimits();
  const race=await mkOffer({code:'RACE'+rnd(),kind:'amount_off',value:10,usage_limit:1},{activate:true});
  const [ra,rb]=[await mkUser('buyer','Racer A'),await mkUser('buyer','Racer B')];
  const results=await Promise.all([checkout(ra.token,{items:cartA,code:race.code,tel:ra.phone}),checkout(rb.token,{items:cartA,code:race.code,tel:rb.phone})]);
  const statuses=results.map((r)=>r.status).sort();
  ok(statuses[0]===201&&statuses[1]===409,`two simultaneous uses of a 1-use offer: exactly one wins (${statuses})`);
  ok(/fully claimed/.test(results.find((r)=>r.status===409).body.error),'and the other is told it is fully claimed');
  const raceUses=await one(`select count(*)::int n from offer_redemptions where offer_id=$1`,[race.id]);
  eq(raceUses.n,1,'only one redemption exists');
  await call('POST',`/api/offers/admin/${race.id}/pause`,admin.token,{});

  // the platform's budget is a hard ceiling
  await resetLimits();
  const bud=await mkOffer({code:'BUD'+rnd(),kind:'percent_off',value:50,budget_total:20},{activate:true});
  const [ba,bb]=[await mkUser('buyer','Budget A'),await mkUser('buyer','Budget B')];
  const b1=await checkout(ba.token,{items:cartA,code:bud.code,tel:ba.phone});
  ok(b1.status===201&&b1.body.orders[0].discount===20,'50% of 60 would be 30, but the 20 QAR budget caps it at 20');
  const b2=await checkout(bb.token,{items:cartA,code:bud.code,tel:bb.phone});
  ok(b2.status===409&&/fully claimed/.test(b2.body.error),'the spent budget switches the offer off');
  const adminBud=(await call('GET','/api/offers/admin',admin.token)).body.offers.find((o)=>o.id===bud.id);
  ok(adminBud.state==='exhausted'&&adminBud.funded===20&&adminBud.redemptions===1,'the admin sees it as exhausted, 20 QAR funded, 1 use');
  await call('POST',`/api/offers/admin/${bud.id}/pause`,admin.token,{});

  // first orders only
  await resetLimits();
  const nb=await mkOffer({code:'NEWB'+rnd(),kind:'amount_off',value:10,first_order_only:true},{activate:true});
  const veteran=await checkout(buyer.token,{items:cartA,code:nb.code,tel:buyerTel});
  ok(veteran.status===409&&/first orders/.test(veteran.body.error),'a returning customer cannot use a first-order offer');
  const fresh=await mkUser('buyer','Brand new');
  eq((await checkout(fresh.token,{items:cartA,code:nb.code,tel:fresh.phone})).status,201,'a brand-new customer can');
  await call('POST',`/api/offers/admin/${nb.id}/pause`,admin.token,{});

  // checkout will not charge a different total than the one the buyer saw, and a typed code is never silently dropped
  await resetLimits();
  const ordersBefore=num((await one(`select count(*)::int n from orders where vendor_id=$1`,[vendorA.id])).n);
  const stale=await checkout(buyer2.token,{items:cartA,tel:buyer2.phone,expected:55});
  ok(stale.status===409&&/total changed/.test(stale.body.error),'a total that no longer matches what the buyer saw is refused for review');
  const badCode=await checkout(buyer2.token,{items:cartA,code:'NOPE'+rnd(),tel:buyer2.phone});
  ok(badCode.status===409&&/not valid/.test(badCode.body.error),'a typed code that fails stops the order instead of charging full price');
  eq(num((await one(`select count(*)::int n from orders where vendor_id=$1`,[vendorA.id])).n),ordersBefore,'neither attempt created an order');

  // ================================================================== 9. the one-QAR floor keeps a rider's cash collection real
  await resetLimits();
  await switchOffEverything();
  const allFree=await mkOffer({code:'ALLFREE'+rnd(),kind:'percent_off',value:100},{activate:true});
  await mkOffer({title:'Free delivery for all',kind:'free_delivery',min_subtotal:0},{activate:true});
  const bf=await mkUser('buyer','Floor buyer');
  const floor=await checkout(bf.token,{items:[{listing_id:A2,qty:1}],code:allFree.code,tel:bf.phone,expected:1});
  eq(floor.status,201,'100% off + free delivery on a 5 QAR item: placed');
  const of=floor.body.orders[0];
  ok(of.total===1&&of.discount===4&&of.delivery_discount===10&&of.delivery_fee===10,'the buyer still pays 1 QAR (discount trimmed from the goods first)');
  const rf=await orderRow(of.id);
  ok(num(rf.total)===1&&num(rf.subtotal)===5,'stored: subtotal 5, fee 10, discounts 4 + 10, total 1');
  const doneF=await deliverByRider(of.id,vendorA,rider);
  eq(doneF.status,200,'the rider can complete it');
  eq(await ledger(of.id,'cash_collected'),1,'RIDER: there is always cash to collect (the ledger rejects zero)');
  eq(await ledger(of.id,'fee_earned'),10,'RIDER: and the full fee is earned');
  await switchOffEverything();

  // ================================================================== 10. admin lifecycle
  const life=await mkOffer({title:'Lifecycle',code:'LIFE'+rnd(),kind:'amount_off',value:5});
  const tomorrow=await mkOffer({title:'Starts tomorrow',code:'SOON'+rnd(),kind:'amount_off',value:5,starts_at:iso(DAY),ends_at:iso(2*DAY)},{activate:true});
  eq(tomorrow.state,'scheduled','switched on but not started yet is "scheduled"');
  ok((await call('GET','/api/offers')).body.offers.every((o)=>o.id!==tomorrow.id),'a scheduled offer is not listed yet');
  const act=await call('POST',`/api/offers/admin/${life.id}/activate`,admin.token,{});
  eq(act.body.offer.state,'live','activate makes it live');
  ok((await call('GET','/api/offers')).body.offers.some((o)=>o.id===life.id),'now it is listed');
  const pz=await call('POST',`/api/offers/admin/${life.id}/pause`,admin.token,{});
  eq(pz.body.offer.state,'paused','pause turns it off straight away');
  ok((await call('GET','/api/offers')).body.offers.every((o)=>o.id!==life.id),'and it disappears from the app');
  eq((await quote(buyer.token,{items:cartA,code:life.code})).body.promo.ok,false,'its code stops working immediately');
  await call('POST',`/api/offers/admin/${life.id}/activate`,admin.token,{});
  await query(`update offers set starts_at=now()-interval '2 days', ends_at=now()-interval '1 minute' where id=$1`,[life.id]);
  const ended=await quote(buyer.token,{items:cartA,code:life.code});
  ok(ended.body.promo.ok===false&&/ended/.test(ended.body.promo.message),'an offer past its end date says it has ended, with no job having run');
  eq((await call('GET','/api/offers/admin',admin.token)).body.offers.find((o)=>o.id===life.id).state,'expired','and the admin sees it as expired');
  ok((await call('POST',`/api/offers/admin/${life.id}/activate`,admin.token,{})).status===400,'an ended offer cannot be switched back on without new dates');
  const priv=await mkOffer({title:'Private',code:'PRIV'+rnd(),kind:'amount_off',value:5,show_in_app:false},{activate:true});
  ok((await call('GET','/api/offers')).body.offers.every((o)=>o.id!==priv.id),'a private code is not listed');
  eq((await quote(buyer.token,{items:cartA,code:priv.code})).body.promo.ok,true,'but it still works when typed');
  await call('POST',`/api/offers/admin/${priv.id}/pause`,admin.token,{});
  await call('POST',`/api/offers/admin/${tomorrow.id}/pause`,admin.token,{});

  // editing and deleting
  eq((await call('DELETE',`/api/offers/admin/${welcome.id}`,admin.token)).status,409,'an offer that has been used cannot be deleted');
  eq((await call('PATCH',`/api/offers/admin/${welcome.id}`,admin.token,{title:'Renamed',code:'DIFFERENT1',kind:'percent_off',value:10,starts_at:iso(-1000),ends_at:iso(DAY)})).status,409,'a used offer\'s code can no longer change');
  eq((await call('PATCH',`/api/offers/admin/${welcome.id}`,admin.token,{title:'Renamed',code:codeW,kind:'amount_off',value:10,starts_at:iso(-1000),ends_at:iso(DAY)})).status,409,'nor its type');
  const edit=await call('PATCH',`/api/offers/admin/${welcome.id}`,admin.token,{title:'10% off (renamed)',code:codeW,kind:'percent_off',value:10,max_discount:5,min_subtotal:50,per_customer_limit:1,starts_at:iso(-3600000),ends_at:iso(30*DAY)});
  ok(edit.status===200&&edit.body.offer.title==='10% off (renamed)','its wording can still be edited');
  const spare=await mkOffer({title:'Never used',code:'SPARE'+rnd()});
  eq((await call('DELETE',`/api/offers/admin/${spare.id}`,admin.token)).status,200,'an offer nobody used can be deleted');
  const list=(await call('GET','/api/offers/admin',admin.token)).body.offers;
  const wl=list.find((o)=>o.id===welcome.id);
  ok(wl.redemptions>=2&&wl.funded>=10&&wl.funded===num(wl.funded_goods+wl.funded_delivery),'the admin list shows what each offer has cost the platform');
  const sum=await call('GET','/api/offers/admin/summary',admin.token);
  ok(sum.status===200&&sum.body.funded_all>=wl.funded&&typeof sum.body.live==='number','the summary totals are available');
  const reds=await call('GET',`/api/offers/admin/${welcome.id}/redemptions`,admin.token);
  ok(reds.status===200&&reds.body.redemptions.some((r)=>r.order_code===r1b.code&&r.goods_discount===5),'the redemption list names the orders');
  ok((await call('GET','/api/offers/admin/summary',buyer.token)).status===403,'the summary is admin-only');

  // ================================================================== 11. push: guests can hear about offers, vendors and riders never do
  await query('delete from push_tokens');await query('delete from guest_push_devices');await query('delete from offer_pushes');
  const T=(n)=>`ExponentPushToken[${n}-${rnd()}${rnd()}]`;
  const tokBuyer=T('buyer'),tokGuest=T('guest'),tokVendor=T('vendor'),tokDriver=T('driver'),tokDead=T('dead'),tokBoth=T('both');
  const regOk=await call('POST','/api/guest-push/device',null,{token:tokGuest,platform:'android'});
  ok(regOk.status===200&&regOk.body.stored===true,'a guest phone can register for offers without an account');
  ok((await call('POST','/api/guest-push/device',null,{token:'not-a-token'})).status===400,'only a well-formed Expo token is accepted');
  await call('POST','/api/guest-push/device',null,{token:tokDead,platform:'ios'});
  await call('POST','/api/guest-push/device',null,{token:tokBoth,platform:'ios'});
  const vendorUser=await one('select user_id from vendors where id=$1',[vendorA.id]);
  await query(`insert into push_tokens(token,user_id,platform) values($1,$2,'android'),($3,$4,'android'),($5,$6,'ios'),($7,$6,'ios')`,
    [tokBuyer,buyer.id,tokVendor,vendorUser.user_id,tokDriver,rider.id,tokBoth]);
  // tokBoth ($7) belongs to the buyer: a phone that is a signed-in customer AND still on the guest list
  await query(`update push_tokens set user_id=$2 where token=$1`,[tokBoth,buyer.id]);
  const aud=await call('GET','/api/offers/admin/push/audience',admin.token);
  ok(aud.status===200&&aud.body.buyers===2&&aud.body.guests===2&&aud.body.total===4,`the audience counts customers only: 2 signed-in buyers, 2 guests, each device once (got ${aud.body.buyers}/${aud.body.guests}/${aud.body.total}); vendor and rider devices are excluded`);
  ok((await call('POST','/api/offers/admin/push',buyer.token,{title:'Hi',body:'Hello there'})).status===403,'a customer cannot send a campaign');
  ok((await call('POST','/api/offers/admin/push',admin.token,{title:'Sale',body:'Big sale today',link:'https://evil.example/pay'})).status===400,'a push cannot carry customers to an outside website');
  ok((await call('POST','/api/offers/admin/push',admin.token,{title:'x',body:'y'})).status===400,'a push needs a real title and message');
  pushes.length=0;
  const send=await call('POST','/api/offers/admin/push',admin.token,{offer_id:welcome.id,title:'10% off today',body:'Use the code at checkout and save.',audience:'all'});
  eq(send.status,202,'an admin sends a campaign');
  await new Promise((r)=>setTimeout(r,800));
  const sentTo=pushes.map((p)=>p.to).sort();
  eq(JSON.stringify(sentTo),JSON.stringify([tokBoth,tokBuyer,tokDead,tokGuest].sort()),'it reached signed-in customers and guests, each device once');
  ok(!sentTo.includes(tokVendor)&&!sentTo.includes(tokDriver),'VENDOR AND RIDER DEVICES NEVER RECEIVE IT');
  ok(pushes.every((p)=>p.channelId==='offers'&&p.data.type==='offer'&&p.data.link==='sokonihub://browse'&&p.data.offerId===welcome.id),'every message uses the offers channel and opens the offer\'s screen');
  eq((await call('POST','/api/offers/admin/push',admin.token,{title:'Again',body:'A second message right away'})).status,429,'a double click cannot send the same message twice');
  eq((await one('select count(*)::int n from guest_push_devices where token=$1',[tokDead])).n,0,'a device the push service reports as gone is removed');
  const hist=await call('GET','/api/offers/admin/push/history',admin.token);
  ok(hist.body.pushes.length===1&&hist.body.pushes[0].recipients===4,'the campaign is logged with its audience size');
  await query('delete from offer_pushes');
  // ================================================================== 12. emails
  const settings=await one('select * from platform_settings where id=true');
  const base={code:'RC1',receipt_number:'RC-1',receipt_issued_at:new Date(),created_at:new Date(),status:'delivered',payment_method:'cash_on_delivery',fulfilment_mode:'delivery',currency:'QAR',
    subtotal:60,delivery_fee:10,total:65,contact_name:'A',contact_phone:'97455123456',delivery_address:'X',city:'Doha',country:'Qatar',business_name:'S',items:[{title:'Palm oil',qty:1,unit_price:60,line_total:60}]};
  const withDiscount=receiptEmailHtml({...base,discount:5,delivery_discount:0,promo_code:'SAVE5'},settings);
  ok(/Discount \(SAVE5\)/.test(withDiscount),'EMAIL: a discounted order\'s receipt shows the discount line so the numbers add up');
  const without=receiptEmailHtml(base,settings);
  ok(!/Discount/.test(without),'EMAIL: an order with no discount renders exactly as before');

  // ================================================================== 13. other surfaces still answer
  for(const [p,t,who] of [['/api/orders/vendor',vendorA.token,'vendor orders'],['/api/vendors/dashboard',vendorA.token,'vendor dashboard'],['/api/wallet',vendorA.token,'vendor wallet'],['/api/drivers/earnings',rider.token,'rider earnings'],['/api/drivers/available-orders',rider.token,'rider job list'],['/api/orders/mine',buyer.token,'buyer orders']]){
    ok((await call('GET',p,t)).status===200,`${who} still responds with offers live in the system`);
  }
  const mineOrders=(await call('GET','/api/orders/mine',buyer.token)).body.orders;
  ok(mineOrders.some((o)=>o.id===o1.id&&Number(o.discount)===5),'the buyer\'s order list includes the discount');

  console.log(`\n${count} offers checks passed.`);
}finally{
  server.kill('SIGTERM');
  stub.close();
  await pool.end().catch(()=>{});
}
