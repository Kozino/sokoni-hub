// Operator-only bootstrap/recovery. Run in a private terminal; never in deployment logs/CI.
import * as OTPAuth from 'otpauth';
import { randomBytes } from 'crypto';
import { one, pool } from '../db';
import { encryptSecret, recoveryHash } from '../mfa';
import { audit } from '../utils';
(async()=>{
 const email=process.argv[2];
 if(!email || !process.argv.includes('--confirm-reset'))throw Error('Usage: npm run admin:mfa -- admin@example.com --confirm-reset. Resets MFA and revokes all existing sessions.');
 const secret=new OTPAuth.Secret({size:20});
 const codes=Array.from({length:10},()=>randomBytes(12).toString('hex').toUpperCase());
 const u=await one<any>(`update users set mfa_secret=$2,mfa_last_step=null,mfa_recovery_hashes=$3
 where (lower(email)=lower($1) or phone=$1) and role='admin' and is_active returning id,email,phone`,[email,encryptSecret(secret.base32),JSON.stringify(codes.map(recoveryHash))]);
 if(!u)throw Error('Active admin not found');
 await audit(u.id,'security.admin_mfa_operator_reset','user',u.id);
 console.log('Add this secret to your authenticator app (time-based, 6 digits):',secret.base32);
 console.log(new OTPAuth.TOTP({issuer:'Sokoni Hub',label:u.email||u.phone,secret,algorithm:'SHA1',digits:6,period:30}).toString());
 console.log('Store these ONE-USE recovery codes offline. They cannot be displayed again:\n'+codes.join('\n'));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
