import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const root=new URL('../',import.meta.url).pathname;
const req=createRequire(new URL('../api/package.json',import.meta.url));
const {chromium}=createRequire(new URL('../web/package.json',import.meta.url))('playwright');
const u=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.endsWith('_test'))throw Error('Isolated local *_test DB required');
const {pool,one}=req('../api/dist/db'),{signToken}=req('../api/dist/auth'),{encryptSecret}=req('../api/dist/mfa');
const bcrypt=req('bcryptjs'),OTP=req('otpauth');
let child,browser,web,logs='';
const api='http://127.0.0.1:4016';
try {
 const password='Browser-test-password!';const secret=new OTP.Secret({size:20});
 const admin=await one("insert into users(full_name,phone,email,password_hash,role,mfa_secret) values('Browser administrator',$1,$2,$3,'admin',$4) returning *",[randomUUID(),randomUUID()+'@example.invalid',await bcrypt.hash(password,10),encryptSecret(secret.base32)]);
 child=spawn(process.execPath,['dist/server.js'],{cwd:root+'api',env:{...process.env,PORT:'4016',PGSSL:'false',CORS_ORIGINS:'http://127.0.0.1:4017',EMAIL_PROVIDER:'none'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(logs)),10000);child.stdout.on('data',d=>{logs+=d;if(logs.includes('listening on')){clearTimeout(t);resolve();}});child.stderr.on('data',d=>logs+=d);child.once('exit',()=>{clearTimeout(t);reject(Error(logs));});});
 web=createServer(async(request,response)=>{
  try {
   if(request.url.startsWith('/api/')){
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    const headers={...request.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
    const r=await fetch(api+request.url,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:Buffer.concat(chunks)});
    response.statusCode=r.status;response.setHeader('Content-Type',r.headers.get('content-type')||'application/json');response.end(Buffer.from(await r.arrayBuffer()));return;
   }
   const name=path.resolve(root+'web/dist','.'+new URL(request.url,'http://local').pathname);
   if(!name.startsWith(path.resolve(root+'web/dist')+path.sep))throw Error('fallback');
   const body=await readFile(name);response.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');response.end(body);
  }catch{response.setHeader('Content-Type','text/html');response.end(await readFile(root+'web/dist/index.html'));}
 });
 await new Promise(r=>web.listen(4017,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4017/login?next=//untrusted.example');
 await page.locator('input[autocomplete=username]').fill(admin.email);
 await page.locator('input[autocomplete=current-password]').fill(password);
 await page.locator('button[type=submit]').click();
 await page.getByRole('heading',{name:'Administrator verification'}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('sokoni_token')),null);
 await page.getByLabel('Authenticator or recovery code').fill(new OTP.TOTP({secret}).generate());
 await page.getByRole('button',{name:'Verify',exact:true}).click();
 await page.waitForURL('**/admin');console.log('PASS browser: MFA challenge → real admin session; external next URL rejected');
 const second=await signToken(admin.id,'admin');
 await page.goto('http://127.0.0.1:4017/account');
 await page.getByRole('heading',{name:'Active sessions'}).waitFor();
 await page.getByText('This session',{exact:false}).first().waitFor();
 const done=page.waitForResponse(r=>r.url().endsWith('/auth/logout-others')&&r.status()===200);
 await page.getByRole('button',{name:'Sign out other sessions'}).click();await done;
 const rejected=await fetch(api+'/api/auth/me',{headers:{Authorization:'Bearer '+second}});assert.equal(rejected.status,401);
 console.log('PASS browser: session management revokes other sessions');
 await page.getByRole('heading',{name:'My bookings',exact:true}).waitFor();console.log('PASS browser: authenticated booking history renders');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS browser: account security page fits mobile viewport');
 assert.deepEqual(errors,[]);console.log('PASS browser: no uncaught JavaScript exceptions');
}finally{
 if(browser)await browser.close();if(web)await new Promise(r=>web.close(r));
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
 await pool.end();
}
