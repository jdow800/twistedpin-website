import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
const base=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(base,'../..');
const stage=process.argv.find(x=>x.startsWith('--stage='))?.slice(8)||'after';
const port=Number(process.env.COGS_QA_PORT||4197);
const esbuild=createRequire(join(root,'package.json'))('esbuild');
const output=join(base,'dist',stage); await mkdir(output,{recursive:true});
await esbuild.build({absWorkingDir:root,entryPoints:[join(base,'entry.jsx')],outdir:output,bundle:true,jsx:'automatic',platform:'browser',
  define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/tprs-api"}'},loader:{'.woff2':'file','.woff':'file'},external:['/pattern/*'],
  plugins:stage==='before'?[{name:'committed-baseline',setup(build){build.onLoad({filter:/[\\/]src[\\/].*\.(tsx?|css)$/},({path})=>{
    const relative=path.slice(root.length+1).replaceAll('\\','/');
    return {contents:execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'show',`${process.env.COGS_QA_BASELINE_REF||"origin/main"}:${relative}`],{cwd:root,encoding:'utf8'}),loader:path.endsWith('.tsx')?'tsx':path.endsWith('.ts')?'ts':'css'};
  });}}]:[],
});
console.log(`Compiled ${stage} fixture from application source`);
if(process.argv.includes('--build-only')) process.exit(0);
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated COGS phone QA</title><link rel="stylesheet" href="/entry.css"><style>body{margin:0}#root{min-height:100vh}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  // The fixture server has NO upstream proxy. An API request escaping the
  // injected mock is rejected here rather than ever reaching production.
  if(path.startsWith('/tprs-api')){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"QA API mock missing"}');return;}
  if(path==='/cogs/'||path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const name=path.slice(1);
  if(!/^[a-zA-Z0-9_.-]+$/.test(name)){res.writeHead(404);res.end();return;}
  try{const data=await readFile(join(output,name));res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'font/woff2');res.end(data);}
  catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Isolated ${stage} COGS QA http://127.0.0.1:${port}/cogs/`));
