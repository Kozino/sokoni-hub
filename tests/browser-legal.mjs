// Browser checks with real local API/Postgres; no production data or fake frontend API fixtures.
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
if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.endsWith('_test')||process.env.NODE_ENV==='production')throw Error('Isolated local *_test DB required');
const {pool,one,query}=req('../api/dist/db'),{signToken}=req('../api/dist/auth');
const bcrypt=req('bcryptjs');let child,browser,web,logs='',count=0;
const api='http://127.0.0.1:4021',site='http://127.0.0.1:4022';
function ok(v,message){assert(v,message);count++;console.log('PASS browser:',message);}
try{
 await query('delete from security_rate_limits');
 const password='Browser-deletion-test-password!',hash=await bcrypt.hash(password,10);
 async function make(role){return one("insert into users(full_name,phone,email,password_hash,role) values('Browser Privacy Test',$1,$2,$3,$4) returning *",[randomUUID(),randomUUID()+'@example.invalid',hash,role]);}
 const buyer=await make('buyer'),admin=await make('admin'),vendor=await make('vendor');
 child=spawn(process.execPath,['dist/server.js'],{cwd:root+'api',env:{...process.env,PORT:'4021',PGSSL:'false',CORS_ORIGINS:'http://127.0.0.1:4022',EMAIL_PROVIDER:'none'},stdio:['ignore','pipe','pipe']});
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
 await new Promise(r=>web.listen(4022,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));

 for(const [route,title] of [['/terms','Terms of Use'],['/privacy','Privacy Policy'],['/faq','Frequently asked questions'],['/delete-account','Account deletion'],['/support','Contact & Support']]){
  await page.goto(site+route);await page.getByRole('heading',{name:title,exact:true}).waitFor();
  for(const href of ['/terms','/privacy','/support','/faq','/delete-account'])ok(await page.locator(`footer a[href="${href}"]`).count()===1,route+' footer links '+href);
  await page.setViewportSize({width:390,height:844});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' fits mobile');
 }
 await page.goto(site+'/privacy');await page.getByText('Draft — not finalised for publication',{exact:true}).waitFor();ok(await page.getByText('No effective date — draft only.',{exact:false}).count()===1,'privacy is visibly draft with no invented operator/effective date');
 ok(await page.locator('.legal-hero h1').evaluate(el=>getComputedStyle(el).color==='rgb(255, 255, 255)'),'hero heading has legible light text');
 ok(await page.locator('.legal-page').evaluate(el=>el.getBoundingClientRect().left>=16),'mobile policy content has horizontal reading margins');
 if(process.env.LEGAL_SCREENSHOT)await page.screenshot({path:process.env.LEGAL_SCREENSHOT,fullPage:true});
 await page.goto(site+'/faq');await page.getByText('What must a vendor upload for verification?',{exact:true}).click();ok(await page.getByText('A clear image of the commercial registration',{exact:false}).isVisible(),'FAQ explains CR instead of personal-ID collection');
 await page.evaluate(t=>localStorage.setItem('sokoni_token',t),await signToken(vendor.id,'vendor'));
 await page.goto(site+'/vendor/onboard');await page.getByRole('heading',{name:'Register your business',exact:true}).waitFor();await page.getByPlaceholder('Mama Ngozi Foodstuff').fill('CR Test Store');await page.getByPlaceholder('We sell bulk rice, beans, palm oil and spices, delivered across the city.').fill('Synthetic business description');await page.getByPlaceholder('Nigeria').fill('Qatar');await page.getByPlaceholder('Lagos').fill('Doha');await page.getByPlaceholder('+234 801 234 5678').fill('+974 5555 1111');await page.getByRole('button',{name:'Continue',exact:true}).click();ok(await page.getByText('CR / business-registration licence *',{exact:true}).count()===1,'vendor onboarding requests CR licence');
 ok(await page.getByText("National ID, driver's licence",{exact:false}).count()===0,'old personal-ID hint removed');
 await page.evaluate(t=>localStorage.setItem('sokoni_token',t),await signToken(buyer.id,'buyer'));
 await page.goto(site+'/delete-account');await page.getByLabel('Current account password').fill(password);
 await page.getByLabel('Reason (optional)').fill('Synthetic browser request');await page.getByRole('checkbox').check();
 const submitted=page.waitForResponse(r=>r.url().endsWith('/account-deletion/requests')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Submit deletion request',exact:true}).click();const receipt=await (await submitted).json();
 await page.getByRole('heading',{name:'Request received — save your receipt now'}).waitFor();ok(!!receipt.access_token&&receipt.request.status==='pending','real authenticated request creates pending receipt');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download private receipt'}).click();const download=await downloadEvent;
 const stream=await download.createReadStream();let txt='';for await(const chunk of stream)txt+=chunk;
 ok(txt.includes(receipt.access_token)&&txt.includes(receipt.request.reference),'downloaded receipt contains private tracking credentials');
 ok(await page.evaluate(()=>!JSON.stringify({...localStorage,...sessionStorage}).includes(document.querySelector('.privacy-receipt').textContent.split('Access key: ')[1])),'receipt key is not silently persisted in browser storage');
 const adminContext=await browser.newContext();await adminContext.addInitScript(t=>localStorage.setItem('sokoni_token',t),await signToken(admin.id,'admin'));
 const ap=await adminContext.newPage();ap.on('pageerror',e=>errors.push(e.message));await ap.goto(site+'/admin/deletion');await ap.getByRole('heading',{name:'Privacy requests',exact:true}).waitFor();
 await ap.locator('.privacy-admin-list .privacy-card').filter({hasText:receipt.request.reference}).getByRole('button',{name:'Review request'}).click();await ap.getByRole('heading',{name:'Request review',exact:true}).waitFor();
 ok(await ap.getByLabel('Message visible to the requester').count()===1,'administrator sees real request review form');
 await ap.getByLabel('Message visible to the requester').fill('Profile removed; synthetic closure record retained as documented.');
 await ap.getByLabel('Retained records, purpose/legal reason and exceptions').fill('Minimal synthetic closure record retained for follow-up. No actual transactions or external copies exist for this test account.');
 await ap.getByLabel('Next manual retained-record review date').fill('2099-01-01');
 for(const box of await ap.locator('form').last().getByRole('checkbox').all())await box.check();
 await ap.getByLabel('Type COMPLETE REVIEWED DELETION').fill('COMPLETE REVIEWED DELETION');
 ap.once('dialog',d=>d.accept());const done=ap.waitForResponse(r=>r.url().endsWith('/complete')&&r.request().method()==='POST');
 await ap.getByRole('button',{name:'Complete reviewed deletion',exact:true}).click();assert.equal((await done).status(),200);
 await ap.getByText('Reviewed profile/file deletion completed.',{exact:false}).waitFor();ok(true,'reviewed browser completion anonymises real local account');
 const guest=await browser.newContext();const gp=await guest.newPage();gp.on('pageerror',e=>errors.push(e.message));await gp.goto(site+'/delete-account');
 await gp.getByLabel('Request reference',{exact:true}).fill(receipt.request.reference);await gp.getByLabel('Private access key').fill(receipt.access_token);
 await gp.getByRole('button',{name:'Check request status',exact:true}).click();await gp.locator('.privacy-state').filter({hasText:'completed'}).waitFor();ok(true,'guest tracks completed request after account closure');
 await gp.setViewportSize({width:390,height:844});ok(await gp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'long receipt references do not overflow mobile');
 ok((await one('select full_name,is_active,email from users where id=$1',[buyer.id])).full_name==='Deleted account','browser flow changed database rather than a demo state');
 ok(errors.length===0,'no uncaught browser exceptions: '+errors.join('; '));console.log(`${count} legal/deletion browser checks passed.`);
}finally{
 if(browser)await browser.close();if(web)await new Promise(r=>web.close(r));
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await pool.end();
}
