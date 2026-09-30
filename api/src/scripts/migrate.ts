import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { pool } from '../db';

(async()=>{
 const dir=path.resolve(__dirname,'../../../db');
 const files=['schema.sql','pin-migration.sql',...fs.readdirSync(path.join(dir,'migrations')).filter(f=>/^\d+.*\.sql$/.test(f)).sort().map(f=>'migrations/'+f)];
 const c=await pool.connect();
 try {
  // Session-level lock: use a direct connection or session pooler, NOT transaction pooling.
  await c.query("select pg_advisory_lock(73652109)");
  await c.query('create table if not exists public.schema_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now(), adopted boolean not null default false)');
  await c.query('revoke all on public.schema_migrations from public');
  await c.query(`do $$ declare r text; begin foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on public.schema_migrations from %I',r); end if;
   end loop; end $$`);
  const applied=(await c.query('select * from public.schema_migrations')).rows;
  const existing=(await c.query("select to_regclass('public.users') as t")).rows[0].t;
  if(existing && !applied.length) {
   if(!process.argv.includes('--adopt-through-011')) throw Error('Existing database without migration ledger. Back up, verify migrations through 011 + PIN, then explicitly run --adopt-through-011. Do not replay historical data migrations.');
   // Conservative readiness check. Operator must also verify historical migrations themselves.
   for(const [table,col] of [['users','sessions_valid_from'],['orders','source'],['order_items','kind'],['vendors','bank_iban'],['listings','supplier_note'],['platform_settings','reviews_require_purchase'],['service_bookings','slot_starts_at'],['vendor_booking_settings','cancel_notice_hours']]) {
    const r=await c.query('select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3',['public',table,col]);
    if(!r.rowCount) throw Error(`Cannot adopt: missing ${table}.${col}`);
   }
   await c.query('begin');
   try {for(const f of files.filter(f=>!f.startsWith('migrations/') || Number(path.basename(f).split('_')[0])<=11)) {
    await c.query('insert into schema_migrations(name,checksum,adopted) values($1,$2,true)',[f,createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex')]);
   } await c.query('commit');} catch(e){await c.query('rollback');throw e;}
  }
  for(const f of files) {
   const sql=fs.readFileSync(path.join(dir,f),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
   const prev=(await c.query('select checksum from schema_migrations where name=$1',[f])).rows[0];
   if(prev){if(prev.checksum!==hash) throw Error('Applied migration changed: '+f);console.log('Already applied:',f);continue;}
   console.log('Applying:',f);
   // Historical baseline requires a commit before using newly added enum values.
   // Its first stage is idempotent. All other files + their ledger entry are atomic.
   let body=sql;
   if(f==='schema.sql') {const at=sql.indexOf('\ncommit;');if(at>=0){await c.query(sql.slice(0,at));body=sql.slice(at+8);}}
   body=body.replace(/^(begin|commit);\s*$/gmi,'');
   await c.query('begin');
   try {await c.query(body);await c.query('insert into schema_migrations(name,checksum) values($1,$2)',[f,hash]);await c.query('commit');}
   catch(e){await c.query('rollback');throw e;}
  }
  console.log('Migration ledger is up to date.');
 } finally {await c.query('select pg_advisory_unlock(73652109)').catch(()=>{});c.release();await pool.end();}
})().catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1;});
