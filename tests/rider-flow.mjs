// Rider flow checks: arrival, pickup after arrival, release, pickup distance, rider PIN change
// and rider account deletion. Uses an isolated PostgreSQL *_test database and starts the built API.
import assert from 'node:assert/strict';
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
const PORT=String(4700+Math.floor(Math.random()*200));
const BASE=`http://127.0.0.1:${PORT}`;
const {pool,one,query}=require('../api/dist/db');
const {signToken}=require('../api/dist/auth');
const {hashPin}=require('../api/dist/pin');
const bcrypt=require('bcryptjs');

let count=0;
const ok=(v,m)=>{assert(v,m);console.log('PASS',m);count++;};

const STORE={lat:25.2854,lng:51.531};
const NEAR={lat:25.2854+0.0009,lng:51.531};   // about 100 m: inside the geofence
const FAR={lat:25.2854+0.01,lng:51.531};       // about 1.1 km: outside

const server=spawn(process.execPath,['dist/server.js'],{cwd:new URL('../api/',import.meta.url).pathname,env:{...process.env,PORT,NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
async function waitForServer(){
  for(let i=0;i<60;i++){
    try{const r=await fetch(`${BASE}/api/health`);if(r.status<500)return;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('API did not start:\n'+serverLog.slice(-2000));
}
async function call(method,path,token,body){
  const r=await fetch(`${BASE}${path}`,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,body:json};
}

async function newDriver(){
  const pw=await bcrypt.hash('Correct-horse-battery-1',4);
  const u=await one(`insert into users(full_name,phone,email,password_hash,role) values('Rider test',$1,$2,$3,'driver') returning id`,
    ['974'+randomUUID().replace(/\D/g,'').slice(0,12),randomUUID()+'@example.invalid',pw]);
  await query(`insert into drivers(user_id,status,vehicle_type,license_plate,is_online,current_lat,current_lng)
               values($1,'approved','Motorbike',$2,true,$3,$4)`,[u.id,'R-'+randomUUID().slice(0,6),NEAR.lat,NEAR.lng]);
  return u.id;
}
async function newStore(){
  const pw=await bcrypt.hash('x',4);
  const u=await one(`insert into users(full_name,phone,email,password_hash,role) values('Store test',$1,$2,$3,'vendor') returning id`,
    ['974'+randomUUID().replace(/\D/g,'').slice(0,12),randomUUID()+'@example.invalid',pw]);
  return one(`insert into vendors(user_id,business_name,slug,whatsapp,country,city,status,lat,lng)
              values($1,'Rider store',$2,'97400000000','QA','Doha','verified',$3,$4) returning id`,
    [u.id,'rider-'+randomUUID().slice(0,8),STORE.lat,STORE.lng]);
}
async function newOrder(vendorId){
  const o=await one(`insert into orders(code,vendor_id,status,payment_method,subtotal,delivery_fee,total,contact_name,contact_phone,
                       delivery_address,city,country,fulfilment_mode,source)
              values($1,$2,'dispatched','cash_on_delivery',50,10,60,'Buyer','97411111111','Street 1','Doha','QA','delivery','marketplace')
              returning id`,['R'+randomUUID().slice(0,8).toUpperCase(),vendorId]);
  await query(`insert into order_items(order_id,title,unit_price,qty,line_total) values($1,'Goods',50,1,50)`,[o.id]);
  return o.id;
}
const statusOf=async(id)=>(await one('select status from orders where id=$1',[id])).status;

try{
  await waitForServer();
  const driverId=await newDriver();
  const driverToken=await signToken(driverId,'driver');
  const store=await newStore();

  // 1) Pickup distance on the request list
  const o1=await newOrder(store.id);
  const list=await call('GET','/api/drivers/available-orders',driverToken);
  assert.equal(list.status,200,'available-orders responds');
  const req1=list.body.orders.find(x=>x.id===o1);
  assert(req1,'the new request is listed');
  ok(typeof req1.pickup_km==='number' && req1.pickup_km>0.05 && req1.pickup_km<0.3,`request shows pickup distance (${req1.pickup_km} km)`);

  // 2) Accept, then arrival is refused outside the geofence
  const acc=await call('POST',`/api/drivers/orders/${o1}/accept`,driverToken,{});
  assert.equal(acc.status,200,'accept works');
  ok(await statusOf(o1)==='dispatched_to_driver','accepted order is dispatched_to_driver');
  const far=await call('POST',`/api/drivers/orders/${o1}/arrive`,driverToken,FAR);
  ok(far.status===422 && /m from the store/.test(far.body?.error?.message||far.body?.message||JSON.stringify(far.body)),'arrival is refused far from the store with the distance');
  ok(await statusOf(o1)==='dispatched_to_driver','refused arrival leaves status unchanged');

  // 3) Arrival at the store, then pickup from the arrived state
  const arr=await call('POST',`/api/drivers/orders/${o1}/arrive`,driverToken,NEAR);
  assert.equal(arr.status,200,`arrival accepted (${arr.status} ${JSON.stringify(arr.body)})`);
  ok(await statusOf(o1)==='driver_arrived','arrival sets driver_arrived');
  const pick=await call('POST',`/api/drivers/orders/${o1}/pickup`,driverToken,NEAR);
  assert.equal(pick.status,200,`pickup accepted after arrival (${pick.status} ${JSON.stringify(pick.body)})`);
  ok(await statusOf(o1)==='out_for_delivery','pickup after arrival moves to out_for_delivery');

  // 4) Release is allowed after arrival but before pickup
  // Close the first job so the rider can take a second one.
  await query("update orders set status='delivered' where id=$1",[o1]);
  const o2=await newOrder(store.id);
  assert.equal((await call('POST',`/api/drivers/orders/${o2}/accept`,driverToken,{})).status,200,'second job accepted');
  assert.equal((await call('POST',`/api/drivers/orders/${o2}/arrive`,driverToken,NEAR)).status,200,'arrival on second job');
  const rel=await call('POST',`/api/drivers/orders/${o2}/release`,driverToken,{});
  assert.equal(rel.status,200,'release works after arrival');
  ok(await statusOf(o2)==='dispatched','released order goes back to the pool');

  // 5) Rider PIN change
  // Setting the PIN directly bumps the session version (by design), so sign in again afterwards.
  await query(`update users set pin_hash=$2 where id=$1`,[driverId,await hashPin(driverId,'1234')]);
  const pinToken=await signToken(driverId,'driver');
  const badPin=await call('POST','/api/auth/pin/change',pinToken,{current_pin:'9999',new_pin:'4321'});
  ok(badPin.status>=400 && badPin.status<500,'rider PIN change refuses a wrong current PIN');
  const goodPin=await call('POST','/api/auth/pin/change',pinToken,{current_pin:'1234',new_pin:'4827'});
  assert.equal(goodPin.status,200,`rider PIN change accepted (${goodPin.status} ${JSON.stringify(goodPin.body)})`);
  const freshToken=goodPin.body.token;
  assert(freshToken,'PIN change returns a fresh session token');
  ok(true,'rider can change the PIN');

  // 6) Rider account deletion request is accepted with the right password, refused with the wrong one
  const badDel=await call('POST','/api/account-deletion/requests',freshToken,{password:'wrong-password-here-1',acknowledge:true});
  ok(badDel.status>=400,'deletion refuses a wrong password');
  const goodDel=await call('POST','/api/account-deletion/requests',freshToken,{password:'Correct-horse-battery-1',acknowledge:true,reason:'test'});
  assert.equal(goodDel.status,201,`rider deletion request created (${goodDel.status} ${JSON.stringify(goodDel.body)})`);
  ok(/^DEL/.test(goodDel.body.request.reference),'rider receives a deletion reference');

  console.log(`\n${count} rider-flow checks passed.`);
}finally{
  server.kill('SIGTERM');
  await pool.end().catch(()=>{});
}
