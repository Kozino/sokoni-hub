const { build } = require('./load');
const M = '/home/user/sokoni-hub-v2/db/migrations/';
let pass=0, fail=0;
const ok=(c,m)=>{ c?(pass++,console.log('  ✔',m)):(fail++,console.log('  ✖',m)); };

(async () => {
  const db = await build([M+'003_currency_billing.sql', M+'004_payouts_email.sql', M+'005_service_bookings.sql']);
  console.log('migration 005 applied');

  const cols = (await db.query(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_name='service_bookings' order by 1`)).rows;
  const names = cols.map(c=>c.column_name);
  for (const c of ['id','code','listing_id','vendor_id','buyer_id','contact_name','contact_phone',
                   'contact_email','preferred_at','preferred_note','scheduled_at','quoted_price',
                   'quoted_price_type','currency','status','vendor_note','cancel_reason',
                   'first_viewed_at','contacted_at','completed_at','created_at','updated_at'])
    ok(names.includes(c), `column ${c}`);

  const en = (await db.query(
    `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
      where t.typname='booking_status' order by e.enumsortorder`)).rows.map(r=>r.enumlabel);
  ok(JSON.stringify(en)===JSON.stringify(['new','contacted','confirmed','completed','cancelled','no_show']),
     'booking_status enum: '+en.join(','));

  const idx = (await db.query(`select indexname from pg_indexes where tablename='service_bookings'`)).rows.map(r=>r.indexname);
  for (const i of ['idx_bookings_vendor','idx_bookings_buyer','idx_bookings_status','idx_bookings_listing','idx_bookings_code'])
    ok(idx.includes(i), `index ${i}`);

  // idempotent
  const fs=require('fs');
  await db.exec(fs.readFileSync(M+'005_service_bookings.sql','utf8').replace(/create extension[^;]*;/gi,''));
  ok(true, 're-running 005 is idempotent');

  // seed a vendor + service listing and insert a booking
  await db.exec(`
    insert into users (id,email,password_hash,full_name,role,phone)
      values ('11111111-1111-1111-1111-111111111111','v@t.com','x','V','vendor','97455551111');
    insert into vendors (id,user_id,business_name,slug,whatsapp,city,country,status)
      values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
              'Glow Salon','glow','97455551111','Doha','Qatar','verified');
    insert into categories (id,name,slug,kind) values
      ('33333333-3333-3333-3333-333333333333','Hair','hair','service');
    insert into listings (id,vendor_id,category_id,kind,title,slug,price,currency,price_type,status)
      values ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',
              '33333333-3333-3333-3333-333333333333','service','Dreadlocks','dreads',150,'QAR','from','active');
  `);

  await db.exec(`insert into service_bookings (code,listing_id,vendor_id,contact_name,contact_phone,
    preferred_at,quoted_price,quoted_price_type,currency)
    values ('BKG-T1','44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',
            'Amina','+97433334444', now()+interval '2 days', 150,'from','QAR')`);
  const b = (await db.query(`select * from service_bookings where code='BKG-T1'`)).rows[0];
  ok(b.status==='new','new booking defaults to status=new');
  ok(b.buyer_id===null,'guest booking allows null buyer_id');
  ok(Number(b.quoted_price)===150,'price snapshot stored');

  // unique code
  let dup=false;
  try { await db.exec(`insert into service_bookings (code,listing_id,vendor_id,contact_name,contact_phone)
    values ('BKG-T1','44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','X','1')`); }
  catch { dup=true; }
  ok(dup,'duplicate code rejected');

  // bad status rejected
  let bad=false;
  try { await db.query(`update service_bookings set status='refunded' where code='BKG-T1'`); } catch { bad=true; }
  ok(bad,'invalid status rejected by enum');

  // updated_at trigger
  const before=b.updated_at;
  await new Promise(r=>setTimeout(r,30));
  await db.query(`update service_bookings set status='contacted' where code='BKG-T1'`);
  const after=(await db.query(`select updated_at from service_bookings where code='BKG-T1'`)).rows[0].updated_at;
  ok(new Date(after)>new Date(before),'updated_at trigger fires');

  // cascade on listing delete
  await db.query(`delete from listings where id='44444444-4444-4444-4444-444444444444'`);
  const left=(await db.query(`select count(*)::int c from service_bookings`)).rows[0].c;
  ok(left===0,'bookings cascade when the listing is deleted');

  console.log(`\n005 schema: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{ console.error('FAILED ->',e.message); process.exit(1); });
