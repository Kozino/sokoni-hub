import * as OTPAuth from 'otpauth';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { tx } from './db';
import { charge } from './security';
import { HttpError } from './utils';

function key(){const s=process.env.MFA_ENCRYPTION_KEY||'';if(!/^[a-f0-9]{64}$/i.test(s))throw new HttpError(503,'Administrator MFA is not configured. Contact the operator.');return Buffer.from(s,'hex');}
export function encryptSecret(secret:string){const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key(),iv);const body=Buffer.concat([c.update(secret,'utf8'),c.final()]);return [iv,c.getAuthTag(),body].map(b=>b.toString('base64')).join('.');}
function decryptSecret(value:string){const [iv,tag,body]=value.split('.').map(s=>Buffer.from(s,'base64'));const c=createDecipheriv('aes-256-gcm',key(),iv);c.setAuthTag(tag);return Buffer.concat([c.update(body),c.final()]).toString('utf8');}
export const recoveryHash=(code:string)=>createHash('sha256').update(code.replace(/[-\s]/g,'').toUpperCase()).digest('hex');
export function adminChallenge(user:any){
 key();
 if(!user.mfa_secret) throw new HttpError(403,'Administrator MFA enrollment is required. Ask the operator to run the secure enrollment command.');
 return {mfa_required:true,mfa_token:jwt.sign({sub:user.id,ver:user.session_version,pur:'admin-mfa'},config.jwtSecret+':admin-mfa',{expiresIn:'5m',algorithm:'HS256'}),full_name:user.full_name};
}
export async function verifyAdmin(token:string,code:string){
 let p:any;try{p=jwt.verify(token,config.jwtSecret+':admin-mfa',{algorithms:['HS256']});}catch{throw new HttpError(400,'Sign-in expired. Start again.');}
 if(p.pur!=='admin-mfa')throw new HttpError(400,'Invalid sign-in step');
 await charge('mfa:'+p.sub,5,900);
 return tx(async c=>{
 const u=(await c.query("select * from users where id=$1 and role='admin' and is_active for update",[p.sub])).rows[0];
 if(!u?.mfa_secret || u.session_version!==p.ver)throw new HttpError(400,'Sign-in expired. Start again.');
 if(/^\d{6}$/.test(code)) {
  const now=Date.now();const totp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(decryptSecret(u.mfa_secret)),algorithm:'SHA1',digits:6,period:30});
  const delta=totp.validate({token:code,window:1,timestamp:now});const step=Math.floor(now/30000)+(delta||0);
  if(delta===null || (u.mfa_last_step!==null && step<=Number(u.mfa_last_step)))throw new HttpError(400,'Invalid or already-used authenticator code');
  await c.query('update users set mfa_last_step=$2 where id=$1',[u.id,step]);
 } else {
  const h=recoveryHash(code);const codes:string[]=u.mfa_recovery_hashes;
  if(!codes.includes(h))throw new HttpError(400,'Invalid recovery code');
  await c.query('update users set mfa_recovery_hashes=$2 where id=$1',[u.id,JSON.stringify(codes.filter(x=>x!==h))]);
 }
 return u;
 });
}
