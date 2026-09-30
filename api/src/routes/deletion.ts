import {Router} from 'express';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import {randomBytes,randomUUID,createHash} from 'crypto';
import {PoolClient} from 'pg';
import {one,query,tx} from '../db';
import {requireAuth,blockImpersonation} from '../auth';
import {HttpError,audit,randomCode,validateUuidParam} from '../utils';
import {charge} from '../security';
import {config} from '../config';

export const deletionRouter=Router();
deletionRouter.param('id', validateUuidParam);
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const id=z.string().uuid();
const open=['pending','in_review','needs_action','processing'];
const publicCols='id,reference,status,public_message,retention_summary,retention_review_date,created_at,updated_at,completed_at';
const customerAuth=[requireAuth('buyer','vendor'),blockImpersonation];
const adminAuth=[requireAuth('admin'),blockImpersonation];

async function blockers(c:PoolClient,user:string){
 const r=await c.query(`select
 (select count(*)::int from orders where (buyer_id=$1 or vendor_id in(select id from vendors where user_id=$1)) and status not in ('delivered','cancelled')) as open_orders,
 (select count(*)::int from service_bookings where (buyer_id=$1 or vendor_id in(select id from vendors where user_id=$1)) and status in ('new','contacted','confirmed')) as open_bookings,
 (select count(*)::int from complaints where (reporter_id=$1 or vendor_id in(select id from vendors where user_id=$1)) and status in ('open','investigating')) as open_complaints,
 (select count(*)::int from vendor_statements where vendor_id in(select id from vendors where user_id=$1) and status in('draft','issued') and (net_due_to_platform<>0 or net_due_to_vendor<>0)) as unsettled_statements`,[user]);
 return r.rows[0];
}
function assertClear(b:any){if(Object.values(b).some(n=>Number(n)>0))throw new HttpError(409,'Resolve open orders, bookings, complaints and statements before completing deletion.',b);}

// Durable request, not an instant account erasure or ordinary sign-out.
deletionRouter.post('/requests',...customerAuth,async(req,res,next)=>{
 try{
 const b=z.object({password:z.string().min(1).max(200),acknowledge:z.literal(true),reason:z.string().trim().max(500).optional()}).parse(req.body);
 await charge('deletion-password:'+req.user!.id,5,900);
 const u=await one<any>('select password_hash,session_version from users where id=$1',[req.user!.id]);
 if(!u||!await bcrypt.compare(b.password,u.password_hash))throw new HttpError(400,'Current password is incorrect');
 const token=randomBytes(32).toString('hex');
 const result=await tx(async c=>{
  const current=(await c.query('select id,session_version,is_active from users where id=$1 for update',[req.user!.id])).rows[0];
  if(!current?.is_active||current.session_version!==u.session_version)throw new HttpError(401,'Sign in again');
  const existing=(await c.query('select id from account_deletion_requests where user_id=$1 and status=any($2::text[])',[current.id,open])).rows[0];
  if(existing)throw new HttpError(409,'You already have an open deletion request. View it below.');
  return (await c.query(`insert into account_deletion_requests(reference,user_id,access_hash,reason)
    values($1,$2,$3,$4) returning ${publicCols}`,[randomCode('DEL'),current.id,digest(token),b.reason||null])).rows[0];
 });
 await audit(req.user!,'privacy.deletion_requested','account_deletion_request',result.id);
 res.status(201).json({request:result,access_token:token});
 }catch(e){next(e);}
});
deletionRouter.get('/requests',...customerAuth,async(req,res,next)=>{
 try{res.json({requests:await query(`select ${publicCols} from account_deletion_requests where user_id=$1 order by created_at desc limit 20`,[req.user!.id])});}catch(e){next(e);}
});
deletionRouter.post('/requests/:id/withdraw',...customerAuth,async(req,res,next)=>{
 try{const r=await one(`update account_deletion_requests set status='withdrawn',updated_at=now(),public_message='Withdrawn by the account holder.'
 where id=$1 and user_id=$2 and status in ('pending','in_review','needs_action') returning ${publicCols}`,[id.parse(req.params.id),req.user!.id]);
 if(!r)throw new HttpError(409,'This request cannot be withdrawn online. Contact support.');
 await audit(req.user!,'privacy.deletion_withdrawn','account_deletion_request',req.params.id);res.json({request:r});}catch(e){next(e);}
});
// Receipt credentials go in POST body, never a logged URL. No personal/profile/internal notes returned.
deletionRouter.post('/status',async(req,res,next)=>{
 try{
 await charge('deletion-status:'+req.ip,30,900);
 const b=z.object({reference:z.string().trim().min(10).max(50),access_token:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
 const r=await one(`select ${publicCols} from account_deletion_requests where reference=$1 and access_hash=$2`,[b.reference,digest(b.access_token)]);
 if(!r)throw new HttpError(404,'No matching request found');res.json({request:r});
 }catch(e){next(e);}
});
deletionRouter.get('/admin',...adminAuth,async(req,res,next)=>{
 try{const offset=z.coerce.number().int().min(0).default(0).parse(req.query.offset);
 res.json({requests:await query(`select d.*,u.full_name,u.role from account_deletion_requests d left join users u on u.id=d.user_id order by d.created_at desc limit 100 offset $1`,[offset]) .then(rows=>rows.map(({access_hash,...r}:any)=>r))});}catch(e){next(e);}
});
deletionRouter.get('/admin/:id',...adminAuth,async(req,res,next)=>{
 try{const result=await tx(async c=>{
 const r=(await c.query('select d.*,u.full_name,u.role from account_deletion_requests d left join users u on u.id=d.user_id where d.id=$1',[id.parse(req.params.id)])).rows[0];
 if(!r)throw new HttpError(404,'Request not found');delete r.access_hash;
 return {request:r,blockers:await blockers(c,r.user_id),private_documents:(await c.query('select count(*)::int as n from private_uploads where user_id=$1',[r.user_id])).rows[0].n};
 });res.json(result);}catch(e){next(e);}
});
deletionRouter.patch('/admin/:id',...adminAuth,async(req,res,next)=>{
 try{const b=z.object({status:z.enum(['in_review','needs_action','declined']),public_message:z.string().trim().min(5).max(1000),internal_note:z.string().max(1500).default('')}).parse(req.body);
 const r=await one(`update account_deletion_requests set status=$2,public_message=$3,internal_note=$4,reviewed_by=$5,updated_at=now()
 where id=$1 and status in ('pending','in_review','needs_action') returning ${publicCols}`,[id.parse(req.params.id),b.status,b.public_message,b.internal_note,req.user!.id]);
 if(!r)throw new HttpError(409,'Request is no longer reviewable');await audit(req.user!,'privacy.deletion_review','account_deletion_request',req.params.id,{status:b.status});res.json({request:r});}catch(e){next(e);}
});

async function removeStoredObjects(user:string,renew:()=>Promise<void>){
 const docs=await query<any>('select key from private_uploads where user_id=$1',[user]);
 const vendor=await one<any>('select id,logo_url,id_document_url from vendors where user_id=$1',[user]);
 const items=vendor?await query<any>('select images from listings where vendor_id=$1',[vendor.id]):[];
 const priv=new Set<string>(docs.map(r=>r.key));const pub=new Set<string>();
 const prefix=`${config.supabaseUrl.replace(/\/+$/,'')}/storage/v1/object/public/${encodeURIComponent(config.supabaseBucket)}/`;
 const urls=[vendor?.logo_url,vendor?.id_document_url,...items.flatMap(r=>r.images||[])].filter(Boolean);
 for(const value of urls){
  if(value.startsWith('kyc://'))priv.add(value.slice(6));
  else if(config.supabaseUrl&&value.startsWith(prefix)){
   const key=decodeURIComponent(value.slice(prefix.length));
   if(key.startsWith(user+'/')&&!key.includes('..')&&!key.includes('?'))pub.add(key);
  }
 }
 for(const [bucket,keys] of [[config.privateBucket,[...priv]],[config.supabaseBucket,[...pub]]] as [string,string[]][]){
  if(!keys.length)continue;
  if(!config.supabaseUrl||!config.supabaseKey)throw new HttpError(503,'Storage cleanup is not configured. Account remains blocked; retry after configuration.');
  if(keys.some(k=>!k.startsWith(user+'/')||k.includes('..')))throw new HttpError(409,'Document paths require manual review. No unsafe path will be deleted.');
  for(let i=0;i<keys.length;i+=100){
   await renew();
   const response=await fetch(`${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:{apikey:config.supabaseKey,Authorization:`Bearer ${config.supabaseKey}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:keys.slice(i,i+100)}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new HttpError(503,'Storage cleanup failed. Request remains processing; retry after resolving Storage access.');
  }
 }
 await query('delete from private_uploads where user_id=$1',[user]);
}

// Reviewed closure: automatically removes profile/credentials/known uploaded files.
// Historical records need an explicit human minimisation/retention review, NOT blind cascading deletion.
deletionRouter.post('/admin/:id/complete',...adminAuth,async(req,res,next)=>{
 const claim=randomUUID();let claimedId:string|undefined;
 try{
 const requestId=id.parse(req.params.id);claimedId=requestId;
 const b=z.object({confirmation:z.literal('COMPLETE REVIEWED DELETION'),history_reviewed:z.literal(true),external_copies_reviewed:z.literal(true),financial_reviewed:z.literal(true),
 retention_summary:z.string().trim().min(20).max(1500),retention_review_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),public_message:z.string().trim().min(10).max(1000)}).parse(req.body);
 if(!Number.isFinite(Date.parse(b.retention_review_date))||new Date(b.retention_review_date+'T00:00:00Z').toISOString().slice(0,10)!==b.retention_review_date||b.retention_review_date<=new Date().toISOString().slice(0,10))throw new HttpError(400,'Choose a future date for retained-record review.');
 const user=await tx(async c=>{
  const d=(await c.query('select * from account_deletion_requests where id=$1 for update',[requestId])).rows[0];
  if(!d||!open.includes(d.status))throw new HttpError(409,'Request cannot be completed');
  if(d.processing_claim_until&&new Date(d.processing_claim_until)>new Date())throw new HttpError(409,'Another completion attempt is still running. Refresh later; after an interrupted server run wait up to 10 minutes.');
  const u=(await c.query('select * from users where id=$1 for update',[d.user_id])).rows[0];
  if(!u||u.role==='admin'||u.id===req.user!.id)throw new HttpError(403,'Administrator accounts require a separate controlled handover.');
  // Lock vendor before counting; concurrent checkout/booking must finish or observe suspension.
  await c.query('select id from vendors where user_id=$1 for update',[u.id]);
  assertClear(await blockers(c,u.id));
  if(d.status!=='processing'){
  await c.query("update users set is_active=false where id=$1",[u.id]);
  await c.query("update vendors set status='suspended' where user_id=$1",[u.id]);
  await c.query("update listings set status='removed' where vendor_id in(select id from vendors where user_id=$1)",[u.id]);
  }
  await c.query("update account_deletion_requests set status='processing',updated_at=now(),reviewed_by=$2,retention_summary=$3,retention_review_date=$4,processing_claim=$5,processing_claim_until=now()+interval '10 minutes',public_message='Account access blocked. Profile and document deletion is being processed.' where id=$1",[requestId,req.user!.id,b.retention_summary,b.retention_review_date,claim]);
  return u.id;
 });
 // Idempotent object deletion outside DB transaction. Any failure stays processing, never reports success.
 await removeStoredObjects(user,async()=>{
  const renewed=await one("update account_deletion_requests set processing_claim_until=now()+interval '10 minutes' where id=$1 and processing_claim=$2 and status='processing' returning id",[requestId,claim]);
  if(!renewed)throw new HttpError(409,'Completion ownership changed. Refresh before retrying.');
 });
 const unusableHash=await bcrypt.hash(randomBytes(32).toString('hex'),10);
 const completed=await tx(async c=>{
  const d=(await c.query('select status,processing_claim from account_deletion_requests where id=$1 for update',[requestId])).rows[0];
  if(d?.status==='completed')return (await c.query(`select ${publicCols} from account_deletion_requests where id=$1`,[requestId])).rows[0];
  if(d?.status!=='processing'||d.processing_claim!==claim)throw new HttpError(409,'Request changed; review again');
  assertClear(await blockers(c,user));
  await c.query(`update users set full_name='Deleted account',email=null,phone='deleted-'||id::text,password_hash=$2,pin_hash=null,
   mfa_secret=null,mfa_recovery_hashes='[]',must_change_pin=false,pin_temp_expires_at=null,is_active=false,deleted_at=now() where id=$1`,[user,unusableHash]);
  await c.query(`update vendors set business_name='Closed store',slug='closed-'||id::text,description=null,whatsapp='',country='',city='',address=null,
   logo_url=null,id_document_url=null,lat=null,lng=null,bank_name=null,bank_account_name=null,bank_iban=null,payout_notes=null,status='suspended' where user_id=$1`,[user]);
  await c.query("update listings set images='[]',description=null,supplier_note=null,status='removed' where vendor_id in(select id from vendors where user_id=$1)",[user]);
  await c.query('delete from auth_sessions where user_id=$1 or impersonated_by=$1',[user]);
  const r=(await c.query(`update account_deletion_requests set status='completed',reason=null,internal_note=null,public_message=$2,
   completed_at=now(),updated_at=now(),reviewed_by=$3,processing_claim=null,processing_claim_until=null where id=$1 returning ${publicCols}`,[requestId,b.public_message,req.user!.id])).rows[0];
  await c.query("insert into audit_log(actor_id,action,entity,entity_id,meta) values($1,'privacy.deletion_completed','account_deletion_request',$2,'{}')",[req.user!.id,requestId]);
  return r;
 });res.json({request:completed});
 }catch(e){next(e);}
 finally{if(claimedId)await query('update account_deletion_requests set processing_claim=null,processing_claim_until=null where id=$1 and processing_claim=$2',[claimedId,claim]).catch(()=>console.error('[privacy] Completion lease release failed; retry after expiry.'));}
});
