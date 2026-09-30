// Manual GitHub Actions maintenance only. Never starts the API or prints credentials.
import path from 'path';
import { spawnSync } from 'child_process';
import { pool } from '../db';
import { encryptSecret, recoveryHash } from '../mfa';

async function main() {
 const task=process.env.ONLINE_TASK;
 if(!['check','migrate','enroll'].includes(task||''))throw new Error('Choose check, migrate or enroll.');
 if(task==='migrate') {
  if(process.env.CONFIRM_MIGRATION!=='I VERIFIED MIGRATIONS THROUGH 011 AND PIN')throw new Error('The historical migration confirmation is required.');
  const r=spawnSync(process.execPath,[path.join(__dirname,'migrate.js'),'--adopt-through-011'],{stdio:'inherit',env:process.env});
  if(r.status!==0)throw new Error('Migration did not complete. Stop; do not deploy.');
  console.log('Online database migration completed.');return;
 }
 const c=await pool.connect();
 try {
  if(task==='check') {
   for(const [table,col] of [['users','sessions_valid_from'],['orders','source'],['order_items','kind'],['vendors','bank_iban'],['listings','supplier_note'],['platform_settings','reviews_require_purchase'],['service_bookings','slot_starts_at'],['vendor_booking_settings','cancel_notice_hours']]) {
    const r=await c.query('select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3',['public',table,col]);
    if(!r.rowCount)throw new Error(`Missing required historical column ${table}.${col}. Stop and resolve the missing migration.`);
   }
   const admins=await c.query("select count(*)::int as n from users where role='admin' and is_active");
   if(!admins.rows[0].n)throw new Error('No active administrator exists. Stop and request account setup assistance.');
   console.log('Read-only readiness check passed: connected; historical columns present; active administrator exists. This does not verify every historical data migration or live Storage policy.');return;
  }
  const identifier=(process.env.ADMIN_IDENTIFIER||'').trim();
  const seed=(process.env.ADMIN_MFA_SEED||'').trim().toUpperCase();
  const codes=(process.env.ADMIN_MFA_RECOVERY_CODES||'').trim().split(/\s+/).filter(Boolean).map(x=>x.toUpperCase());
  if(!identifier || identifier.length>200)throw new Error('Set ADMIN_IDENTIFIER to the existing admin email or exact stored phone.');
  if(!/^[A-Z2-7]{32}$/.test(seed))throw new Error('ADMIN_MFA_SEED must contain exactly 32 Base32 characters from the supplied generator.');
  if(codes.length!==10 || codes.some(c=>!/^[A-F0-9]{24}$/.test(c)) || new Set(codes).size!==10)throw new Error('ADMIN_MFA_RECOVERY_CODES must contain ten distinct 24-character hex codes.');
  const encrypted=encryptSecret(seed);
  await c.query('begin');
  try {
   const ready=await c.query("select 1 from schema_migrations where name='migrations/012_security.sql'");
   if(!ready.rowCount)throw new Error('Apply the security migration first.');
   const found=await c.query("select id,mfa_secret from users where (lower(email)=lower($1) or phone=$1) and role='admin' and is_active for update",[identifier]);
   if(found.rowCount!==1)throw new Error('Exactly one active administrator must match ADMIN_IDENTIFIER. No account changed.');
   if(found.rows[0].mfa_secret)throw new Error('Administrator MFA is already enrolled. Nothing was changed. This action cannot reset existing MFA.');
   await c.query('update users set mfa_secret=$2,mfa_last_step=null,mfa_recovery_hashes=$3 where id=$1',[found.rows[0].id,encrypted,JSON.stringify(codes.map(recoveryHash))]);
   await c.query("insert into audit_log(actor_id,action,entity,entity_id,meta) values($1,'security.admin_mfa_online_enrollment','user',$2,'{}')",[found.rows[0].id,found.rows[0].id]);
   await c.query('commit');
   console.log('Administrator MFA enrolled. No seeds or recovery codes are printed. Remove temporary GitHub setup secrets after successful deployment/sign-in.');
  }catch(e){await c.query('rollback');throw e;}
 }finally{c.release();}
}
main().catch(e=>{console.error('Online setup stopped:',e instanceof Error?e.message:'Unexpected error');process.exitCode=1;}).finally(()=>pool.end());
