import { config } from './config';
import { one } from './db';
import { HttpError } from './utils';
const headers=()=>({apikey:config.supabaseKey,Authorization:`Bearer ${config.supabaseKey}`});
export async function assertPrivateBucket(){
 if(!config.supabaseUrl || !config.supabaseKey || config.privateBucket===config.supabaseBucket)throw new HttpError(503,'Private document storage is not configured');
 const r=await fetch(`${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.privateBucket)}`,{headers:headers(),signal:AbortSignal.timeout(10000)});
 if(!r.ok || (await r.json() as any).public!==false)throw new HttpError(503,'A private document bucket is required. Contact support.');
}
export async function documentKey(value:string,userId:string){
 if(!value.startsWith('kyc://'))throw new HttpError(422,'Please upload your identity document securely again; external/public document links are not accepted.');
 const key=value.slice(6);
 if(!await one('select key from private_uploads where key=$1 and user_id=$2',[key,userId]))throw new HttpError(403,'Document does not belong to this account');
 return key;
}
export async function signedDocument(key:string){
 await assertPrivateBucket();
 const r=await fetch(`${config.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(config.privateBucket)}/${key.split('/').map(encodeURIComponent).join('/')}`,{
 method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new HttpError(503,'Document is temporarily unavailable');
 const data:any=await r.json();const url=data.signedURL||data.signedUrl;
 if(typeof url!=='string')throw new HttpError(503,'Document is temporarily unavailable');
 return url.startsWith('/object/')?`${config.supabaseUrl}/storage/v1${url}`:new URL(url,config.supabaseUrl).toString();
}
