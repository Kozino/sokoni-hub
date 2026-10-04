import { createHash } from 'crypto';
import { one } from './db';
import { HttpError } from './utils';
import { RequestHandler } from 'express';

/** Database-backed, shared across instances. Only stores hashed identifiers. */
export async function charge(key: string, limit: number, seconds: number) {
 const hash = createHash('sha256').update(key).digest('hex');
 const r = await one<any>(`insert into security_rate_limits(key,attempts,resets_at)
 values($1,1,now()+$2*interval '1 second') on conflict(key) do update set
 attempts=case when security_rate_limits.resets_at<=now() then 1 else security_rate_limits.attempts+1 end,
 resets_at=case when security_rate_limits.resets_at<=now() then excluded.resets_at else security_rate_limits.resets_at end
 returning attempts`,[hash,seconds]);
 if(r.attempts>limit) throw new HttpError(429,'Too many attempts. Please try again later.');
}
export const limit: (name:string,count:number,seconds:number)=>RequestHandler = (name,count,seconds)=>(req,_res,next)=>{
 charge(`${name}:${req.user?.id||req.ip}`,count,seconds).then(()=>next(),next);
};
// Public DTOs are explicit; adding a private schema column must never publish it.
export const PUBLIC_LISTING = ['id','vendor_id','category_id','kind','title','slug','description','price',
 'currency','quantity','unit','weight_kg','volume_l','duration_mins','service_area','price_type','images',
 'status','views','rating_avg','rating_count','created_at','updated_at','options'];
export const publicListingColumns = (alias='l') => PUBLIC_LISTING.map(c=>`${alias}.${c}`).join(',');
