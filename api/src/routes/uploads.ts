import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { requireAuth, blockImpersonation } from '../auth';
import { HttpError, audit } from '../utils';
import { storageEnabled, uploadObject } from '../storage';
import { assertPrivateBucket, signedDocument } from '../privateDocuments';
import { one, tx } from '../db';
import { charge } from '../security';
export const uploadRouter=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:6,fields:0}});
uploadRouter.post('/',requireAuth(),blockImpersonation,upload.array('files',6),async(req,res,next)=>{
 try {
  if(!storageEnabled)throw new HttpError(503,'File storage is not configured');
  const privateDoc=req.query.purpose==='kyc';
  if(req.query.purpose && !privateDoc)throw new HttpError(400,'Unknown upload purpose');
  const files=(req.files as Express.Multer.File[])||[];
  if(!files.length || (privateDoc && files.length!==1))throw new HttpError(400,'Choose a supported image (one image for business-registration documents)');
  if(privateDoc)await assertPrivateBucket();
  // At most 60 image files per account/day, shared across server instances.
  const urls:string[]=[];
  await tx(async c=>{
  const owner=(await c.query("select is_active from users where id=$1 for share",[req.user!.id])).rows[0];
  if(!owner?.is_active)throw new HttpError(403,"Account is no longer active");
  for(const file of files){
   await charge('upload-file:'+req.user!.id,60,86400);
   let body:Buffer;
   try {
    const image=sharp(file.buffer,{limitInputPixels:25_000_000,failOn:'error',animated:false});
    const meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format||''))throw Error('Unsupported format');
    body=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
   }catch{throw new HttpError(415,'Upload a valid JPEG, PNG or WebP image. PDFs and other file types are not accepted.');}
   const key=`${req.user!.id}/${randomUUID()}.jpg`;
   try {
    const result=await uploadObject(privateDoc?config.privateBucket:config.supabaseBucket,key,body,'image/jpeg');
    if(privateDoc){await c.query('insert into private_uploads(key,user_id,bytes) values($1,$2,$3)',[key,req.user!.id,body.length]);urls.push('kyc://'+key);}
    else urls.push(result.publicUrl);
   }catch(err){if(err instanceof HttpError)throw err;throw new HttpError(503,'Upload failed. Please try again later.');}
  }
  });
  res.status(201).json({urls});
 }catch(e){next(e);}
});
uploadRouter.get('/document',requireAuth('vendor','buyer','admin'),blockImpersonation,async(req,res,next)=>{
 try {
  const value=String(req.query.key||'');const key=value.startsWith('kyc://')?value.slice(6):value;
  const doc=await one<any>('select user_id from private_uploads where key=$1',[key]);
  if(!doc || (req.user!.role!=='admin' && doc.user_id!==req.user!.id))throw new HttpError(404,'Document not found');
  const url=await signedDocument(key);await audit(req.user!.id,'document.read','private_upload',key);
  res.set('Cache-Control','no-store').json({url,expires_in:60});
 }catch(e){next(e);}
});
