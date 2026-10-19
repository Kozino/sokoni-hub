// Money-model, plan-limit and vendor-wallet checks. Uses an isolated PostgreSQL *_test database.
// Calls the compiled API modules directly: no HTTP server is needed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../api/package.json',import.meta.url));
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
if(!['127.0.0.1','localhost','postgres'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw Error('Only isolated *_test databases allowed');
if(process.env.NODE_ENV==='production')throw Error('Never test against production');
process.env.PGSSL='false';
process.env.JWT_SECRET ||= 'integration-only-secret-at-least-32-characters';
process.env.PIN_PEPPER ||= 'integration-only-pepper-at-least-32-characters';
process.env.MFA_ENCRYPTION_KEY ||= 'ab'.repeat(32);
const {pool,one,query}=require('../api/dist/db');
const {moneyModel}=require('../api/dist/moneyModel');
const {creditVendorOnHandover,releaseVendorFunds}=require('../api/dist/walletSettlement');
const bcrypt=require('bcryptjs');
const {computeStatement}=require('../api/dist/billing');

let count=0;
const ok=(v,m)=>{assert(v,m);console.log('PASS',m);count++;};
const num=(v)=>Math.round(Number(v)*100)/100;

async function setModel(model){
  await query(`insert into system_settings (key,value,updated_at) values ('money_model',$1,now())
               on conflict (key) do update set value=excluded.value, updated_at=now()`,[JSON.stringify(model)]);
}
async function setRate(rate){
  await query('update platform_settings set commission_rate=$1 where id=true',[rate]);
}
async function newVendor(){
  const hash=await bcrypt.hash('x',4);
  const u=await one("insert into users(full_name,phone,email,password_hash,role) values('Money test',$1,$2,$3,'vendor') returning id",
    ['974'+randomUUID().replace(/\D/g,'').slice(0,12),randomUUID()+'@example.invalid',hash]);
  const slug='money-'+randomUUID().slice(0,8);
  return one(`insert into vendors(user_id,business_name,slug,whatsapp,country,city,status,lat,lng)
              values($1,'Money test store',$2,'97400000000','QA','Doha','verified',25.2854,51.531) returning id`,[u.id,slug]);
}
async function newOrder(vendorId,{subtotal,fee=0,goods=subtotal,rider=true}){
  const o=await one(`insert into orders(code,vendor_id,status,payment_method,subtotal,delivery_fee,total,contact_name,contact_phone,
                       delivery_address,city,country,fulfilment_mode,source)
              values($1,$2,'delivered','cash_on_delivery',$3,$4,$5,'Buyer','97411111111','Street 1','Doha','QA',
                     $6,'marketplace') returning id, code`,
    ['T'+randomUUID().slice(0,8).toUpperCase(),vendorId,subtotal,fee,subtotal+fee,rider?'delivery':'pickup']);
  await query(`insert into order_items(order_id,title,unit_price,qty,line_total) values($1,'Goods',$2,1,$2)`,[o.id,goods]);
  return o;
}
async function wallet(vendorId){
  return one('select wallet_pending, wallet_available from vendors where id=$1',[vendorId]);
}
async function tx(fn){
  const c=await pool.connect();
  try{await c.query('begin');const r=await fn(c);await c.query('commit');return r;}
  catch(e){await c.query('rollback');throw e;}
  finally{c.release();}
}

try{
  // 1. Defaults and exclusivity of the money model.
  await query("delete from system_settings where key='money_model'");
  let m=await moneyModel();
  ok(m.commission_enabled===false && m.subscription_enabled===true,'default money model is subscription mode (commission off)');

  await setModel({commission_enabled:true,subscription_enabled:true});
  m=await moneyModel();
  ok(!(m.commission_enabled&&m.subscription_enabled),'both switches on in storage still resolves to one active mode');
  ok(m.commission_enabled===true && m.subscription_enabled===false,'commission wins when both are stored on, and plan limits are off');

  await setModel({commission_enabled:false,subscription_enabled:true});
  m=await moneyModel();
  ok(m.subscription_enabled===true && m.commission_enabled===false,'subscription mode: plan limits apply, no commission');

  await setModel({commission_enabled:false,subscription_enabled:false});
  m=await moneyModel();
  ok(m.subscription_enabled===true,'neither mode stored falls back to subscription mode');

  // 2. Wallet in commission mode: pending on handover, available on final, idempotent.
  const v1=await newVendor();
  await setModel({commission_enabled:true,subscription_enabled:false});
  await setRate(0.10);
  const o1=await newOrder(v1.id,{subtotal:100,fee:15,goods:100});
  await tx(c=>creditVendorOnHandover(c,o1.id));
  let w=await wallet(v1.id);
  ok(num(w.wallet_pending)===90 && num(w.wallet_available)===0,'handover credits vendor pending with commission taken (100 - 10 = 90)');
  await tx(c=>creditVendorOnHandover(c,o1.id));
  w=await wallet(v1.id);
  ok(num(w.wallet_pending)===90,'second handover credit is ignored (no double credit)');
  await tx(c=>releaseVendorFunds(c,o1.id));
  w=await wallet(v1.id);
  ok(num(w.wallet_pending)===0 && num(w.wallet_available)===90,'final order moves the amount from pending to available');
  await tx(c=>releaseVendorFunds(c,o1.id));
  w=await wallet(v1.id);
  ok(num(w.wallet_available)===90,'second release is ignored (no double payout credit)');

  const d1=await one('select funds_collected_by, vendor_amount, platform_commission, driver_amount from orders where id=$1',[o1.id]);
  ok(d1.funds_collected_by==='platform' && num(d1.platform_commission)===10 && num(d1.vendor_amount)===90 && num(d1.driver_amount)===15,
     'order records platform holding, commission 10, vendor 90, and the delivery fee 15 to the rider');

  // 3. Subscription mode: no commission, vendor gets full sales.
  const v2=await newVendor();
  await setModel({commission_enabled:false,subscription_enabled:true});
  const o2=await newOrder(v2.id,{subtotal:100,fee:15,goods:100});
  await tx(c=>creditVendorOnHandover(c,o2.id));
  w=await wallet(v2.id);
  ok(num(w.wallet_pending)===100,'subscription mode: Sokoni settles the full sales amount, with no commission');
  const d2=await one('select funds_collected_by, wallet_credited from orders where id=$1',[o2.id]);
  ok(d2.funds_collected_by==='platform' && d2.wallet_credited===true,'rider-delivered order is platform-held in subscription mode too');

  // 4. Vendor-held orders never touch the wallet.
  const o3=await newOrder(v2.id,{subtotal:50,rider:false});
  await tx(c=>releaseVendorFunds(c,o3.id));
  w=await wallet(v2.id);
  ok(num(w.wallet_pending)===100 && num(w.wallet_available)===0,'order without wallet credit is not released');

  // 5. Vendor statements: the delivery fee is the rider's pay, never vendor sales.
  const st=computeStatement([{id:'s1',subtotal:100,delivery_fee:15,total:115,funds_collected_by:'platform',goods_subtotal:100}],0.1);
  ok(num(st.gross_sales)===100 && num(st.commission_amount)===10 && num(st.net_due_to_vendor)===90,
     'statement: sales 100, commission 10, vendor owed 90; delivery fee 15 not counted as vendor sales');
  const st2=computeStatement([{id:'s2',subtotal:100,delivery_fee:15,total:115,funds_collected_by:'vendor',goods_subtotal:100}],0.1);
  ok(num(st2.net_due_to_platform)===10 && num(st2.net_due_to_vendor)===0,
     'vendor-held cash: vendor owes only the 10 commission, not the delivery fee');
  ok(num(st.delivery_total)===15,'statement still reports delivery fees for transparency');

  // 6. Restore the default.
  await setRate(0);
  await query("delete from system_settings where key='money_model'");
  console.log(`\n${count} money-model and wallet checks passed.`);
}catch(e){
  console.error(e);
  process.exitCode=1;
}finally{
  await pool.end();
}
