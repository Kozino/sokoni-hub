import {spawn} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname;
const u=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
if(!['localhost','127.0.0.1','postgres'].includes(u.hostname)||!u.pathname.endsWith('_test'))throw Error('Only isolated *_test database allowed');
const env={...process.env,PGSSL:'false',PORT:'4015',EMAIL_PROVIDER:'none'};
let output='';const server=spawn(process.execPath,['dist/server.js'],{cwd:root+'api',env,stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('API startup timeout: '+output)),10000);server.stdout.on('data',d=>{output+=d;if(output.includes('listening on')){clearTimeout(t);resolve();}});server.stderr.on('data',d=>output+=d);server.once('exit',()=>{clearTimeout(t);reject(Error(output));});});
 const test=spawn(process.execPath,['tests/bookings-api.mjs'],{cwd:root,env:{...env,TEST_DB:env.DATABASE_URL,TEST_API:'http://127.0.0.1:4015/api'},stdio:'inherit'});
 const code=await new Promise(r=>test.once('exit',r));if(code!==0)throw Error('Booking tests failed');
}finally{if(server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}}
