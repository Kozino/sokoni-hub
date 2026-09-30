// Explicit operator-only legacy image migration. Never follows arbitrary user URLs.
// Existing PDFs/third-party URLs require secure manual review/re-upload.
import {randomUUID} from 'crypto';
import sharp from 'sharp';
import {one,query,pool} from '../db';
import {config} from '../config';
import {assertPrivateBucket} from '../privateDocuments';
import {uploadObject} from '../storage';
import {audit} from '../utils';
(async()=>{
 const apply=process.argv.includes('--apply');
 if(!apply)console.log('DRY RUN: no uploads, writes or deletions. Use --apply only after backup and reviewing this list.');
 await assertPrivateBucket();
 const rows=await query<any>("select id,user_id,id_document_url from vendors where id_document_url is not null and id_document_url not like 'kyc://%'");
 const prefix=`${config.supabaseUrl.replace(/\/+$/,'')}/storage/v1/object/public/${encodeURIComponent(config.supabaseBucket)}/`;
 for(const row of rows){
  if(!row.id_document_url.startsWith(prefix)){console.log(row.id,'MANUAL: outside configured public bucket');continue;}
  const old=row.id_document_url.slice(prefix.length);
  if(old.includes('?')||old.includes('#')||old.includes('..')||!old.startsWith(row.user_id+'/')){console.log(row.id,'MANUAL: unexpected document key');continue;}
  // Do not remove objects used elsewhere. If shared by public listings, require manual handling.
  const shared=await one<any>(`select 1 from listings where images::text like '%'||$1||'%' union all
    select 1 from vendors where logo_url=$1 or (id<>$2 and id_document_url=$1) limit 1`,[row.id_document_url,row.id]);
  if(shared){console.log(row.id,'MANUAL: object appears in another reference');continue;}
  console.log(row.id,apply?'Migrating image':'ELIGIBLE image candidate');if(!apply)continue;
  const r=await fetch(prefix+old,{signal:AbortSignal.timeout(20000)});
  if(!r.ok||Number(r.headers.get('content-length')||0)>5*1024*1024)throw Error('Legacy download unavailable/oversized; vendor '+row.id);
  // Stream a bounded amount; avoid buffering an unexpectedly large object.
  const chunks:Buffer[]=[];let size=0;
  if(!r.body)throw Error('Empty legacy document');
  const reader=r.body.getReader();while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>5*1024*1024){await reader.cancel();throw Error('Legacy document too large');}chunks.push(Buffer.from(part.value));}
  let image:Buffer;try{image=await sharp(Buffer.concat(chunks),{limitInputPixels:25_000_000}).rotate().jpeg({quality:90}).toBuffer();}
  catch{console.log(row.id,'MANUAL: unsupported/corrupt document, unchanged');continue;}
  const key=`${row.user_id}/${randomUUID()}.jpg`;
  await uploadObject(config.privateBucket,key,image,'image/jpeg');
  await query('insert into private_uploads(key,user_id,bytes) values($1,$2,$3)',[key,row.user_id,image.length]);
  const updated=await one('update vendors set id_document_url=$2 where id=$1 and id_document_url=$3 returning id',[row.id,'kyc://'+key,row.id_document_url]);
  if(!updated){console.log(row.id,'CHANGED during migration: old copy NOT deleted; inspect orphan private upload');continue;}
  // Supabase batch DELETE; the old object must not remain publicly accessible.
  const deleted=await fetch(`${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.supabaseBucket)}`,{method:'DELETE',headers:{apikey:config.supabaseKey,Authorization:`Bearer ${config.supabaseKey}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[decodeURIComponent(old)]}),signal:AbortSignal.timeout(20000)});
  if(!deleted.ok)throw Error('Private copy created but PUBLIC DELETION FAILED for vendor '+row.id+'. Remove old object manually; preserve this warning.');
  await audit(null,'document.legacy_migrated','vendor',row.id);
  console.log(row.id,'Private copy saved; public deletion accepted. Verify origin/CDN removal manually.');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
