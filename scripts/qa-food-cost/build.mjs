import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const base=fileURLToPath(new URL('.',import.meta.url)),website=fileURLToPath(new URL('../../',import.meta.url));
await mkdir(join(base,'dist'),{recursive:true});
await createRequire(join(website,'package.json'))('esbuild').build({entryPoints:[join(base,'fixture.jsx')],outdir:join(base,'dist'),bundle:true,jsx:'automatic',platform:'browser',nodePaths:[join(website,'node_modules')],define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'}});
