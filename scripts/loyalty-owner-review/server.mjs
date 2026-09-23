import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {allowRequest} from './policy.mjs';
import {allowOwnerWrite,recordOwnerResponse} from './live-policy.mjs';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const evidence=new URL('../../../Loyalty/scripts/points-notice/',import.meta.url);
const packet=JSON.parse(fs.readFileSync(new URL('owner-online-preview.local.json',evidence),'utf8'));
const ownerConfig=JSON.parse(fs.readFileSync(new URL('../../docs/rollouts/owner-private-checkout-config.local.json',evidence),'utf8'));
const normalize=x=>String(x??'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
assert(packet.passed&&packet.codeId&&packet.after?.owner?.id);
assert.equal(normalize(packet.after.owner.phone),ownerConfig.phone);
if(fs.readdirSync(root).some(n=>/^\.env($|\.)/.test(n)&&!n.endsWith('.example')))throw Error('No Website env allowed');
const live=process.argv.includes('--live-owner');
const trial=live?JSON.parse(fs.readFileSync(new URL('owner-private-checkout-window.local.json',evidence),'utf8')):null;
if(live){
 assert.equal(trial.mode,'owner-live');assert.equal(trial.commitVerified,true);
 assert.equal(trial.codeId,packet.codeId);assert.equal(trial.code,packet.code);
 assert.equal(trial.customerId,packet.after.owner.id);assert.equal(trial.phone,ownerConfig.phone);
 assert.equal(trial.email.toLowerCase(),ownerConfig.email.toLowerCase());
 assert.equal(trial.backendCommit,'4e31e9dbd1f5c682dcd27be738ea1892f651137b');
 assert(trial.publishableKey?.startsWith('pk_live_'));
 assert(Date.now()-Date.parse(trial.createdAt)>=0&&Date.now()-Date.parse(trial.createdAt)<5*60000);
 assert(Date.parse(trial.deadline)-Date.now()>3*60000&&Date.parse(trial.deadline)-Date.now()<=45*60000);
}
const state={cartToken:null,intentIds:new Set(),lineRefs:new Set(),bookingId:null};
const cookieJar=new Map();
const origin='http://127.0.0.1:55443',upstream='https://tprs-kxht.onrender.com';
const proof={mode:live?'owner-live-payment':'read-only-live-catalog',startedAt:new Date().toISOString(),allowed:[],blocked:[],pid:process.pid,status:'running'};
const save=()=>fs.writeFileSync(new URL(live?'owner-live-preview-state.local.json':'owner-readonly-preview.local.json',evidence),JSON.stringify({...proof,...(live?{intentIds:[...state.intentIds],bookingId:state.bookingId}:{})},null,2));
const stub=path.join(root,'scripts/loyalty-ui/stripe-stub.tsx');
const server=await createServer({root,configFile:false,envFile:false,publicDir:path.join(root,'public'),cacheDir:path.join(os.tmpdir(),'loyalty-owner-readonly-vite'),logLevel:'error',
 server:{host:'127.0.0.1',port:55443,strictPort:true,fs:{allow:[root]}},esbuild:{jsx:'automatic'},
 optimizeDeps:{include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','zod',...(live?['@stripe/react-stripe-js','@stripe/stripe-js']:[])]},
 resolve:{alias:live?[]:[{find:'@stripe/react-stripe-js',replacement:stub},{find:'@stripe/stripe-js',replacement:stub}]},
 define:{'import.meta.env.PUBLIC_TPRS_API_BASE':JSON.stringify('/tprs-api'),'import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY':JSON.stringify(live?trial.publishableKey:'pk_test_readonly_no_provider')},
 plugins:[{name:'owner-readonly-bridge',configureServer(s){s.middlewares.use(async(req,res,next)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Cache-Control','no-store');
  if(req.headers.host!=='127.0.0.1:55443'||(req.headers.origin&&req.headers.origin!==origin)){res.statusCode=403;res.end('Local review only');return;}
  if(req.url==='/__owner_review__'){res.setHeader('content-type','application/json');res.end(JSON.stringify({live,deadline:trial?.deadline??null}));return;}
  if(req.url==='/'){res.statusCode=302;res.setHeader('Location','/scripts/loyalty-owner-review/?code='+encodeURIComponent(packet.code));res.end();return;}
  if(!req.url?.startsWith('/tprs-api/'))return next();
  const u=new URL(req.url,origin),route=u.pathname.slice('/tprs-api'.length).replace(/\/$/,'');
  const finish=(status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(body));};
  try{
   let raw='';for await(const chunk of req){raw+=chunk.toString();if(raw.length>65536)return finish(413,{error:'Review request too large'});}
   let body;try{body=raw?JSON.parse(raw):undefined;}catch{return finish(400,{error:'Invalid JSON'});}
   const writeAllowed=live&&allowOwnerWrite({method:req.method,path:route,body,trial,state});
   const readAllowed=allowRequest({method:req.method,path:route,body,code:packet.code,phone:ownerConfig.phone});
   if(!readAllowed&&!writeAllowed){
    proof.blocked.push({method:req.method,route});save();
    return finish(403,{error:'owner_test_restricted',message:live?'This test requires Jon’s designated contact details and reward, during the scheduled test period.':'Payment testing is not open. No reservation or payment was created.'});
   }
   const response=await fetch(upstream+route+u.search,{method:req.method,redirect:'error',headers:{...(raw?{'content-type':'application/json'}:{}),...(live&&cookieJar.size?{cookie:[...cookieJar.values()].join('; ')}:{})},...(raw?{body:raw}:{}),signal:AbortSignal.timeout(20000)});
   const result=await response.text();
   if(live&&response.ok){
    for(const cookie of response.headers.getSetCookie()){
     const pair=cookie.split(';')[0];cookieJar.set(pair.split('=')[0],pair);
    }
    if(writeAllowed||route==='/api/cart'){
     recordOwnerResponse({path:route,body,response:JSON.parse(result),state});
    }
   }
   proof.allowed.push({method:req.method,route,status:response.status});save();
   res.statusCode=response.status;res.setHeader('content-type',response.headers.get('content-type')??'application/json');res.end(result);
  }catch{return finish(502,{error:'readonly_upstream_failed'});}
 });}}]
});
await server.listen();
const lifetime=live?Date.parse(trial.deadline)-Date.now()+30*60000:45*60000;
proof.url=origin+'/';proof.expiresAt=new Date(Date.now()+lifetime).toISOString();save();
console.log(JSON.stringify({url:proof.url,mode:proof.mode,expiresAt:proof.expiresAt,pid:process.pid}));
let closing=false;
async function close(){if(closing)return;closing=true;clearTimeout(timer);await server.close();proof.status='closed';save();}
const timer=setTimeout(()=>void close(),lifetime);
process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
