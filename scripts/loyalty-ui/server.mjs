import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function startLocalUi() {
 if(process.env.LOYALTY_INTERNAL_TEST!=='synthetic-only')throw Error('Synthetic-only marker required');
 for(const name of fs.readdirSync(root))if(/^\.env($|\.(local|production|development|test))/.test(name))throw Error('No environment credentials allowed');
 const stub=path.join(root,'scripts/loyalty-ui/stripe-stub.tsx');
 const server=await createServer({root,configFile:false,envFile:false,envDir:path.join(root,'scripts/loyalty-ui'),publicDir:false,
  cacheDir:path.join(root,'scripts/loyalty-ui/.vite'),logLevel:'error',
  server:{host:'127.0.0.1',port:55441,strictPort:true,fs:{allow:[root]}},
  esbuild:{jsx:'automatic'},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','zod']},
  resolve:{alias:[{find:'@stripe/react-stripe-js',replacement:stub},{find:'@stripe/stripe-js',replacement:stub}]},
  define:{'import.meta.env.PUBLIC_TPRS_API_BASE':'"/tprs-api"','import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY':'"pk_test_local_stub"'}
 });
 await server.listen();return server;
}
