// Deep links and notification taps in the consumer app.
//
// `resolveLink` decides where a link goes and refuses anything outside the app, so a push can never open a web page.
// `openAppLink` holds a link until the app is ready, then opens it with Home underneath so Back always has somewhere to go.
// The navigator and storage are stubbed, so this runs in plain Node. It bundles the real source with esbuild, which
// api/node_modules provides (run `npm ci` in api/ first).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const esbuild=createRequire(path.join(root,'api/package.json'))('esbuild');

let count=0;
const ok=(v,m)=>{assert(v,m);console.log('PASS',m);count++;};
// compared as JSON: the code under test runs in its own vm realm, so object prototypes differ from this file's
const eq=(a,b,m)=>{assert.equal(JSON.stringify(a),JSON.stringify(b),`${m} (got ${JSON.stringify(a)})`);console.log('PASS',m);count++;};

const STUBS={
  checkoutDraft:`export const updateDraft = (p) => { globalThis.__drafts.push(p); };`,
  data:`export const cleanPromo = (v) => String(v ?? '').trim().toUpperCase().replace(/\\s+/g, '');`,
  navRef:`export const navigationRef = globalThis.__nav;`,
};
async function load(entry,sandbox){
  const result=await esbuild.build({
    entryPoints:[path.join(root,entry)],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent',
    plugins:[{name:'stubs',setup(b){
      b.onResolve({filter:/^\.\/(checkoutDraft|data|navRef)$/},(a)=>({path:a.path.slice(2),namespace:'stub'}));
      b.onLoad({filter:/.*/,namespace:'stub'},(a)=>({contents:STUBS[a.path],loader:'js'}));
    }}],
  });
  const module={exports:{}};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,console,globalThis:sandbox,...sandbox},{filename:entry});
  return module.exports;
}

// ------------------------------------------------------------------ the resolver
const {resolveLink,linkFromNotification}=await load('mobile/src/links.ts',{});
eq(resolveLink('sokonihub://offers'),{screen:'offers'},'offers screen');
eq(resolveLink('sokonihub://store/oriaku-foods'),{screen:'store',params:{slug:'oriaku-foods'}},'a store by slug');
eq(resolveLink('sokonihub://store/Kella%20Hairs'),{screen:'store',params:{slug:'Kella Hairs'}},'a percent-encoded slug is decoded');
eq(resolveLink('sokonihub://listing/abc-123'),{screen:'listing',params:{id:'abc-123'}},'a listing by id');
eq(resolveLink('sokonihub://browse?category=oils-condiments'),{screen:'browse',tab:true,params:{category:'oils-condiments',kind:'product'}},'a category');
eq(resolveLink('sokonihub://browse?q=palm+oil'),{screen:'browse',tab:true,params:{q:'palm oil'}},'a search');
eq(resolveLink('sokonihub://services'),{screen:'services',tab:true},'the services tab');
eq(resolveLink('sokonihub://cart?code=WELCOME10'),{screen:'cart',tab:true,applyCode:'WELCOME10'},'the cart, with a code to keep');
eq(resolveLink('sokonihub://assistant'),{screen:'assistant'},'sokoni assistant');
eq(resolveLink('/offers'),{screen:'offers'},'a plain path works (what the server may send)');
eq(resolveLink('SOKONIHUB://Offers'),{screen:'offers'},'scheme and path are case-insensitive');
eq(resolveLink('exp://192.168.1.5:8081/--/store/abc'),{screen:'store',params:{slug:'abc'}},'the Expo Go wrapper is understood');
for(const bad of ['','   ','https://evil.example/pay','http://sokonihub.qa/offers','javascript:alert(1)','tel:+97455123456','intent://scan/#Intent;scheme=zxing;end','data:text/html,hi','sokonihub://store','sokonihub://listing/','sokonihub://admin/secret','sokonihub://store/%E0%A4%A'.replace('store/%E0%A4%A','nothing')]){
  ok(resolveLink(bad)===null,`refused: ${JSON.stringify(bad)}`);
}
ok(resolveLink(null)===null&&resolveLink(undefined)===null,'null and undefined are nothing');
ok(resolveLink('sokonihub://store/%E0%A4%A')?.params?.slug==='%E0%A4%A','a broken percent sequence never throws');

// ------------------------------------------------------------------ what a tapped notification means
eq(linkFromNotification({link:'sokonihub://offers',type:'offer'}),'sokonihub://offers','an offer notification opens its link');
eq(linkFromNotification({status:'out_for_delivery'}),'sokonihub://orders','an order update opens the orders list');
eq(linkFromNotification({link:'sokonihub://store/x',status:'confirmed'}),'sokonihub://store/x','an explicit link wins over a status');
ok(linkFromNotification({})===null&&linkFromNotification(null)===null&&linkFromNotification({link:42})===null,'a notification with nothing to open opens nothing');

// ------------------------------------------------------------------ the opener: hold until ready, then open with Home underneath
const nav={ready:false,calls:[],isReady(){return this.ready;},reset(x){this.calls.push(x);}};
const drafts=[];
const sandbox={__nav:nav,__drafts:drafts};
const {openAppLink,setLinksReady,flushPendingLink}=await load('mobile/src/openLink.ts',sandbox);

ok(openAppLink('sokonihub://store/abc')===true&&nav.calls.length===0,'a link that arrives before the app is ready is held, not lost');
nav.ready=true;
flushPendingLink();
ok(nav.calls.length===0,'it is still held while the welcome pages / sign-in check are showing');
setLinksReady(true);
eq(nav.calls[0],{index:1,routes:[{name:'home'},{name:'store',params:{slug:'abc'}}]},'once ready it opens with Home underneath, so Back has somewhere to go');

nav.calls.length=0;
openAppLink('sokonihub://services');
eq(nav.calls[0],{index:0,routes:[{name:'services',params:undefined}]},'a tab destination replaces the stack');

nav.calls.length=0;drafts.length=0;
openAppLink('sokonihub://cart?code=welcome10');
eq(drafts[0],{promo:'WELCOME10'},'a cart link keeps the code (tidied) for the cart to check');
eq(nav.calls[0].routes[0].name,'cart','and opens the cart');

nav.calls.length=0;
ok(openAppLink('https://evil.example')===false&&nav.calls.length===0,'an outside address is refused and nothing moves');
ok(openAppLink('sokonihub://nowhere')===false&&nav.calls.length===0,'an unknown in-app address is refused');

setLinksReady(false);nav.calls.length=0;
openAppLink('sokonihub://offers');openAppLink('sokonihub://orders');
setLinksReady(true);
ok(nav.calls.length===1&&nav.calls[0].routes[1].name==='orders','if two links arrive while waiting, only the latest opens');

console.log(`\n${count} mobile link checks passed.`);
