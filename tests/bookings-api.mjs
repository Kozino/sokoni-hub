// Integration test against an isolated Postgres database and the real API.
// Apply schema + migrations first, start API with matching TEST_DB / JWT secret.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require=createRequire(new URL('../api/package.json',import.meta.url));
const {Pool}=require('pg'),jwt=require('jsonwebtoken');
const dbURL=process.env.TEST_DB;
if(!dbURL||!new URL(dbURL).pathname.endsWith('_test'))throw new Error('TEST_DB must point to an isolated *_test database.');
const db=new Pool({connectionString:dbURL});
const base=process.env.TEST_API||'http://127.0.0.1:4001/api';
let checks=0;
const check=(condition,message)=>{assert(condition,message);checks++;console.log('PASS',message);};
async function call(path,method='GET',body,token){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();return{status:r.status,data:r.headers.get('content-type')?.includes('json')?JSON.parse(text):text};}
await db.query("delete from users where full_name in ('Test Calendar Vendor','Other Vendor')");
const suffix=Date.now().toString();
const user=(await db.query("insert into users(full_name,phone,password_hash,role) values('Test Calendar Vendor',$1,'test-only','vendor') returning id",['v'+suffix])).rows[0].id;
const other=(await db.query("insert into users(full_name,phone,password_hash,role) values('Other Vendor',$1,'test-only','vendor') returning id",['o'+suffix])).rows[0].id;
const {signToken}=require('../api/dist/auth');
const token=await signToken(user,'vendor');
const otherToken=await signToken(other,'vendor');
const vendor=(await db.query("insert into vendors(user_id,business_name,slug,whatsapp,country,city,address,status) values($1,'Test Calendar Salon',$2,'97455550000','Qatar','Doha','Salwa Road','verified') returning id",[user,'calendar-'+suffix])).rows[0].id;
const category=(await db.query("select id from categories where kind='service' and not is_banned limit 1")).rows[0].id;
const listing=(await db.query("insert into listings(vendor_id,category_id,kind,title,slug,price,duration_mins,status) values($1,$2,'service','Manicure','manicure',80,45,'active') returning id",[vendor,category])).rows[0].id;
const listing2=(await db.query("insert into listings(vendor_id,category_id,kind,title,slug,price,duration_mins,status) values($1,$2,'service','Braids','braids',250,120,'active') returning id",[vendor,category])).rows[0].id;
const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const at=time=>new Date(date+'T'+time+':00+03:00').toISOString();
const getSlots=()=>call(`/bookings/slots?listing_id=${listing}&date=${date}`);
const cfg={auto_accept:false,offers_at_vendor:true,offers_home_service:true,home_service_notes:'Doha only',cancel_notice_hours:24,buffer_mins:15,slot_step_mins:15,min_notice_hours:2,max_advance_days:30};
const hours=Array.from({length:7},(_,weekday)=>({weekday,opens:'09:00',closes:'18:00'}));
const create=(time,extra={})=>call('/bookings','POST',{listing_id:listing,contact_name:'Test Customer',contact_phone:'+974 3333 4444',slot_start:at(time),location_type:'vendor',...extra});
try{
 check((await getSlots()).data.mode==='request','never-configured provider keeps legacy request mode');
 const legacy=await call('/bookings','POST',{listing_id:listing,contact_name:'Legacy Customer',contact_phone:'97433334444',preferred_at:at('14:00')});
 check(legacy.status===201,'legacy preferred-time request creates a booking');
 check((await call('/bookings/vendor/availability','PUT',{settings:cfg,hours},token)).status===200,'weekly hours save');
 check((await getSlots()).data.slots.some(s=>s.label==='10:00'),'Qatar-local free times generated');
 check((await call(`/bookings/slots?listing_id=${listing}&date=2026-02-30`)).status===400,'invalid calendar dates rejected');
 const race=await Promise.all([create('10:00'),create('10:00',{contact_phone:'97433334445'})]);
 check(race.filter(r=>r.status===201).length===1&&race.filter(r=>r.status===409).length===1,'concurrent identical bookings: exactly one succeeds');
 const bk=race.find(r=>r.status===201).data.booking;
 check(bk.status==='new','vendor confirmation is the default');
 check((await create('10:45',{listing_id:listing2})).status===409,'buffer enforced across different service listings');
 const short=(await getSlots()).data.slots, long=(await call(`/bookings/slots?listing_id=${listing2}&date=${date}`)).data.slots;
 check(short.some(s=>s.label==='17:00')&&!long.some(s=>s.label==='17:00'),'service-specific duration respects closing time');
 check((await call(`/bookings/${bk.id}`,'PATCH',{status:'confirmed'},otherToken)).status===403,'other vendor cannot manage this booking');
 check((await call(`/bookings/${bk.id}`,'PATCH',{status:'confirmed',vendor_note:'PRIVATE SECRET'},token)).status===200,'vendor accepts held slot');
 const lookup=`/bookings/track?code=${bk.code}&phone=${bk.contact_phone}`;
 const track=(await call(lookup)).data.booking;
 check(track.status==='confirmed'&&!('vendor_note'in track),'public tracking excludes private vendor note');
 check((await call(`/bookings/track?code=${bk.code}&phone=4444`)).status===400,'phone suffix cannot unlock booking');
 const ics=await call(`/bookings/ics?code=${bk.code}&phone=${bk.contact_phone}`);
 check(ics.status===200&&ics.data.includes('TRIGGER:-PT2H')&&ics.data.includes('DTSTART:'+at('10:00').replace(/[-:]/g,'').replace('.000','')),'calendar file has UTC time and two-hour alarm');
 check((await call(`/bookings/${bk.id}`,'PATCH',{scheduled_at:at('13:00')},token)).status===422,'fixed slot cannot be silently rescheduled');
 check((await call(`/bookings/${bk.id}`,'PATCH',{status:'completed'},token)).status===422,'future appointment cannot be marked completed');
 const timeOff=await call('/bookings/vendor/time-off','POST',{starts_at:at('09:00'),ends_at:at('11:00'),reason:'Private break'},token);
 check(timeOff.status===201&&timeOff.data.conflicts.some(b=>b.id===bk.id),'time off reports existing booking conflicts without cancelling');
 check(!(await getSlots()).data.slots.some(s=>s.label==='09:00'),'time off removes free slots');
 check((await call('/bookings/vendor/time-off/'+timeOff.data.time_off.id,'DELETE',undefined,token)).status===200,'time off can be removed');
 check((await call(`/bookings/${legacy.data.booking.id}`,'PATCH',{scheduled_at:at('14:00'),status:'confirmed'},token)).status===200,'legacy request gets an agreed appointment');
 check(!(await getSlots()).data.slots.some(s=>s.label==='14:00'),'legacy agreed times also block calendar slots');
 const pending=await create('12:00',{location_type:'home',address:'West Bay, Tower 4, apartment 12',contact_phone:'97433334446'});
 check(pending.status===201&&pending.data.booking.location_type==='home','optional home service persists address');
 check((await create('13:00',{location_type:'home'})).status===422,'home visit requires address');
 const cancelled=await call('/bookings/cancel','POST',{code:pending.data.booking.code,phone:'33334446'});
 check(cancelled.status===200&&cancelled.data.booking.status==='cancelled','guest cancellation accepts full local Qatar number');
 check((await call(`/bookings/${pending.data.booking.id}`,'PATCH',{status:'confirmed'},token)).status===409,'closed booking cannot be reopened');
 await call('/bookings/vendor/availability','PUT',{settings:{...cfg,auto_accept:true,cancel_notice_hours:168},hours},token);
 const auto=await create('16:00',{contact_phone:'97433334447'});
 check(auto.status===201&&auto.data.booking.status==='confirmed','auto-accept confirms immediately');
 check((await call('/bookings/cancel','POST',{code:auto.data.booking.code,phone:'97433334447'})).status===403,'server enforces cancellation cutoff');
 check((await call('/bookings/vendor/availability','PUT',{settings:cfg,hours:[hours[0],{weekday:0,opens:'10:00',closes:'12:00'}]},token)).status===422,'overlapping weekly shifts rejected');
 await call('/bookings/vendor/availability','PUT',{settings:cfg,hours:[]},token);
 const closed=await getSlots();check(closed.data.mode==='calendar'&&closed.data.slots.length===0,'all-days-closed never reopens as legacy requests');
 await call('/bookings/vendor/availability','PUT',{settings:cfg,hours},token);
 const calendar=await call(`/bookings/vendor/calendar?from=${date}&to=${new Date(+new Date(date)+86400000).toISOString().slice(0,10)}`, 'GET',undefined,token);
 check(calendar.status===200&&calendar.data.bookings.some(b=>b.id===bk.id),'vendor calendar returns real booked appointments');
 // Two non-overlapping appointments whose buffer windows collide, submitted simultaneously.
 const nextDate=new Date(+new Date(date)+86400000).toISOString().slice(0,10);
 const raceBody=(time,phone)=>({listing_id:listing,contact_name:'Race Test',contact_phone:phone,slot_start:new Date(nextDate+'T'+time+':00+03:00').toISOString()});
 const gapRace=await Promise.all([call('/bookings','POST',raceBody('09:00','97433334450')),call('/bookings','POST',raceBody('09:45','97433334451'))]);
 check(gapRace.filter(r=>r.status===201).length===1&&gapRace.filter(r=>r.status===409).length===1,'concurrent adjacent appointments still respect buffer gap');
 // Completing an appointment after it happened must not reject its existing time.
 const oldStart=new Date(Date.now()-86400000).toISOString();
 await db.query('update service_bookings set scheduled_at=$2 where id=$1',[legacy.data.booking.id,oldStart]);
 check((await call(`/bookings/${legacy.data.booking.id}`,'PATCH',{status:'completed',scheduled_at:oldStart},token)).status===200,'past agreed appointment can be completed without changing its time');
 await call(`/bookings/${pending.data.booking.id}`,'PATCH',{vendor_note:'Follow-up note'},token);
 check((await db.query('select cancelled_by from service_bookings where id=$1',[pending.data.booking.id])).rows[0].cancelled_by==='buyer','saving vendor note preserves who cancelled');
 // Check the DB exclusion itself, not only the API advisory-lock path.
 let excluded=false;
 try{await db.query(`insert into service_bookings(code,listing_id,vendor_id,contact_name,contact_phone,slot_starts_at,slot_ends_at)
 values($1,$2,$3,'SQL overlap test','97433336666',$4,$5)`,['SQL-'+suffix,listing,vendor,at('10:00'),at('10:45')]);}catch(e){excluded=e.code==='23P01';}
 check(excluded,'database exclusion constraint rejects a direct overlapping insert');
 if(process.env.BOOKING_TEST_SESSION) await writeFile(process.env.BOOKING_TEST_SESSION,JSON.stringify({token,vendor,listing,listing2,date,code:bk.code,phone:bk.contact_phone,base}));
 console.log(`\n${checks} real API/Postgres checks passed.`);
}finally{await db.end();await require('../api/dist/db').pool.end();}
