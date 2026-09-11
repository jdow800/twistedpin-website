import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
const base = fileURLToPath(new URL('.',import.meta.url));
const website = fileURLToPath(new URL('../../',import.meta.url));
const backend = resolve(process.env.BOTTLE_QA_TPRS_ROOT || join(website,'../tprs'));
const require = createRequire(join(website,'package.json'));
const esbuild = require('esbuild');
await mkdir(base+'dist',{recursive:true});
await esbuild.build({entryPoints:[base+'fixture.jsx'],outdir:base+'dist',bundle:true,jsx:'automatic',platform:'browser',
  nodePaths:[join(website,'node_modules')],define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'},
  plugins:[{name:'expose-test-component',setup(build){
    const sources = {
      'qa:count': join(website,'src/components/liquor/views/CountLiquor.tsx'),
      'qa:invoice-match': join(website,'src/components/liquor/views/Invoices.tsx'),
      'qa:delivery-check': join(backend,'apps/backend/src/bar/recent-bottle-size.ts'),
      'qa:styles': join(website,'src/components/liquor/liquor.css'),
    };
    build.onResolve({filter:/^qa:/},({path}) => ({path:sources[path]}));
    build.onLoad({filter:/views[\\/]Invoices\.tsx$/},async ({path}) => ({
      contents:(await readFile(path,'utf8'))+'\nexport {MatchControl};',loader:'tsx',
    }));
  }}],
});
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bottle size QA</title><style>body{margin:0;background:#0e0a1f}#root{min-height:100vh}</style><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const assets={'/fixture.js':['text/javascript',base+'dist/fixture.js'],'/fixture.css':['text/css',base+'dist/fixture.css']};
if (!process.argv.includes('--build-only')) createServer(async(req,res)=>{
  const asset=assets[new URL(req.url,'http://localhost').pathname];
  res.setHeader('Content-Type',asset?.[0]??'text/html');
  res.end(asset?await readFile(asset[1]):html);
}).listen(4177,'127.0.0.1',()=>console.log('Synthetic bottle-size QA http://127.0.0.1:4177'));
