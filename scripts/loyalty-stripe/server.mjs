import {createServer} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function startStripeUi({publishableKey,offline=false,fixture,inject}) {
 if(process.env.LOYALTY_INTERNAL_TEST!=='synthetic-only')throw Error('Synthetic-only marker required');
 if(!offline&&!publishableKey?.startsWith('pk_test_'))throw Error('Stripe test publishable key required');
 if(fs.readdirSync(root).some(n=>/^\.env($|\.)/.test(n)&&!n.endsWith('.example')))throw Error('No Website .env allowed');
 const stub=path.join(root,'scripts/loyalty-ui/stripe-stub.tsx');
 const server=await createServer({root,configFile:false,envFile:false,envDir:path.join(root,'scripts/loyalty-stripe'),publicDir:false,cacheDir:path.join(root,'scripts/loyalty-stripe/.vite'),logLevel:'error',
  server:{host:'127.0.0.1',port:55443,strictPort:true,fs:{allow:[root]}},esbuild:{jsx:'automatic'},
  optimizeDeps:{include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','zod',...(offline?[]:['@stripe/react-stripe-js','@stripe/stripe-js'])]},
  resolve:{alias:offline?[{find:'@stripe/react-stripe-js',replacement:stub},{find:'@stripe/stripe-js',replacement:stub}]:[]},
  define:{'import.meta.env.PUBLIC_TPRS_API_BASE':'"/tprs-api"','import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY':JSON.stringify(offline?'pk_test_local_stub':publishableKey)},
  plugins:[{name:'local-loyalty-bridge',configureServer(s){s.middlewares.use(async(req,res,next)=>{
    if(req.url?.startsWith('/__fixture__')){res.setHeader('content-type','application/json');res.end(JSON.stringify(fixture));return;}
    if(req.url?.startsWith('/book/')){res.statusCode=302;res.setHeader('Location','/scripts/loyalty-stripe/?code='+encodeURIComponent(req.url.slice(6).split('?')[0]));res.end();return;}
    if(!req.url?.startsWith('/tprs-api/'))return next();
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const url=req.url.slice('/tprs-api'.length).replace(/\/(?=\?|$)/,'');
    if(!/^\/api\/(products|availability|cart|checkout|optin-reward)(\/|\?|$)/.test(url)){res.statusCode=403;res.end('Test route not allowed');return;}
    try{const body=Buffer.concat(chunks).toString();const r=await inject({method:req.method,url,headers:{...(req.headers.cookie?{cookie:req.headers.cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{payload:body}:{})});
      res.statusCode=r.statusCode;res.setHeader('content-type',r.headers['content-type']??'application/json');if(r.headers['set-cookie'])res.setHeader('set-cookie',r.headers['set-cookie']);res.end(r.body);
    }catch{res.statusCode=500;res.end('Local bridge failed');}
  });}}]
 });await server.listen();return server;
}
