import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const depRoot = process.env.HOLIDAY_RENDER_DEPS ? resolve(process.env.HOLIDAY_RENDER_DEPS) : repo;
const require = createRequire(resolve(depRoot, 'package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');
const pack = resolve(repo, 'Context/marketing/holiday-drip-2026');
const dir = resolve(pack, 'series/jingle');
const templatePath = 'Context/marketing/holiday-drip-2026/series/jingle/artwork.html';
const source = await readFile(resolve(repo, templatePath), 'utf8');
const hash = b => createHash('sha256').update(b).digest('hex');
const textHash = s => hash(s.replace(/\r\n?/g, '\n'));
const defs = [
  { key:'family', calendar_id:'18-jingle-family-outing', publish_date:'2026-10-30', title:'A little less mall. A lot more bowl.', assets:['FAMILY'], visual:'Actual Twisted Pin photograph of a child bowling, paired with an evergreen editorial panel.' },
  { key:'package', calendar_id:'05-jingle-whats-included', publish_date:'2026-11-06', title:'Bowling. Pizza. Santa. Sunday handled.', light:true, assets:[], visual:'Cream and cranberry typographic package composition; no food or guest imagery.' },
  { key:'photo', calendar_id:'08-jingle-santa-photo', publish_date:'2026-11-13', title:'Bring your people. Charge your phone.', assets:['SANTA'], visual:'Approved illustrated Santa inside a clearly graphic phone frame, with photo-on-your-device language.' },
  { key:'cocoa', calendar_id:'17-jingle-cookie-cocoa', publish_date:'2026-11-20', title:'A little cocoa between frames.', assets:[], visual:'Cranberry and cream ornamental typography with an original SVG outline mug and steam; illustration, not a food photograph.' },
  { key:'lanes', calendar_id:'11-jingle-december-plan', publish_date:'2026-11-27', title:'Same Santa. Your kind of lane.', assets:['TRADITIONAL','VIP'], visual:'Actual Twisted Pin traditional-lane and VIP couch-seating photographs, shown as two clearly labeled settings.' },
  { key:'sunday', calendar_id:'12-jingle-this-sunday', publish_date:'2026-12-04', title:"Santa comes this Sunday. Let's roll.", light:true, assets:['SANTA'], visual:'Cream calendar card showing Sunday December 6, 2026, with the approved illustrated Santa beside it.', cta:'Check times & reserve' },
];
const assetDefs = {
  SANTA: ['Context/marketing/holiday-drip-2026/artwork/santa-entrance-v2-grip-corrected.png','image/png','Approved Santa illustration with owner-requested bowling-ball grip correction through built-in imagegen; previous master retained.'],
  FAMILY: ['public/snap/kid-bowling-1200.jpg','image/jpeg','Published Website photo derivative; original DSC00795.JPG documented in Context/media-needs.md.'],
  TRADITIONAL: ['public/snap/tile-trad-540.webp','image/webp','Actual traditional-lane photograph already used on the approved Jingle Bowl page.'],
  VIP: ['public/snap/tile-vip-540.webp','image/webp','Actual VIP couch-seating photograph already used on the approved Jingle Bowl page.'],
  LOGO_WHITE: ['public/logo/twisted-pin-horizontal-white.png','image/png','Supplied unchanged white logo.'],
  LOGO_INDIGO: ['public/logo/twisted-pin-horizontal-indigo.png','image/png','Supplied unchanged indigo logo.'],
  DISPLAY_FONT: ['node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2','font/woff2','Established Website display substitute.', depRoot],
  UI_FONT: ['node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2','font/woff2','Established Website UI substitute.', depRoot],
  BODY_FONT: ['node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2','font/woff2','Established Website body substitute.', depRoot],
};
const tokens={}, sourceAssets=[];
for(const [token,[path,mime,provenance,root=repo]] of Object.entries(assetDefs)){
  const bytes=await readFile(resolve(root,path));
  tokens[token]=`data:${mime};base64,${bytes.toString('base64')}`;
  const m=mime.startsWith('image/')?await sharp(bytes).metadata():null;
  sourceAssets.push({token,path,provenance,bytes:bytes.length,sha256:hash(bytes),...(m?{width:m.width,height:m.height}: {})});
}
await mkdir(resolve(dir,'exports'),{recursive:true});
const browserChannel=process.env.HOLIDAY_RENDER_BROWSER_CHANNEL;
const browser=await chromium.launch({headless:true,...(browserChannel?{channel:browserChannel}:{})});
const records=[];
let networkRequests=0;
try{
  for(const d of defs) for(const format of ['feed','story']){
    const width=1080,height=format==='feed'?1350:1920;
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.route(/^https?:/i,route=>{networkRequests++;return route.abort()});
    const alt=`${d.visual} ${d.title} Jingle Bowl at Twisted Pin. Sunday, December 6, 2026. ${d.cta||'Reserve your lane'}. twistedpin.com/jingle-bowl/.`;
    const values={...tokens,WIDTH:width,HEIGHT:height,CONCEPT:d.key,FORMAT:format,LOGO:tokens[d.light?'LOGO_INDIGO':'LOGO_WHITE'],ALT:alt.replaceAll('"','&quot;'),CTA:d.cta||'Reserve your lane'};
    const html=source.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{if(!(key in values))throw Error(`Missing token: ${key}`);return values[key]});
    await page.setContent(html);
    await page.evaluate(async()=>{await Promise.all(['900 80px Display','700 27px UI','400 33px Body'].map(x=>document.fonts.load(x)));await document.fonts.ready;await Promise.all([...document.images].map(x=>x.decode()))});
    const checks=await page.evaluate(()=>({
      fontsLoaded:['900 80px Display','700 27px UI','400 33px Body'].every(x=>document.fonts.check(x)),
      canvasOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,
      copyBounds:[...document.querySelectorAll('[data-safe]')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,text:el.innerText||el.alt||''}}).filter(r=>r.width&&r.height),
      text:document.querySelector('main').innerText,
    }));
    const margins={left:58,right:58,top:format==='feed'?40:230,bottom:format==='feed'?40:325};
    if(!checks.fontsLoaded||checks.canvasOverflow)throw Error(`Canvas/font error: ${d.key} ${format}`);
    if(checks.copyBounds.some(r=>r.x<margins.left||r.y<margins.top||r.x+r.width>width-margins.right||r.y+r.height>height-margins.bottom))throw Error(`Copy margin: ${d.key} ${format}\n${JSON.stringify(checks.copyBounds,null,2)}`);
    const overlaps=checks.copyBounds.flatMap((a,i)=>checks.copyBounds.slice(i+1).filter(b=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>2).map(b=>[a.text,b.text]));
    if(overlaps.length)throw Error(`Overlapping copy: ${d.key} ${format}: ${JSON.stringify(overlaps)}`);
    const filename=`${d.publish_date}-${d.calendar_id}-${format}.png`;
    const bytes=await page.screenshot({type:'png'});
    await writeFile(resolve(dir,'exports',filename),bytes);
    records.push({calendar_id:d.calendar_id,format,path:`series/jingle/exports/${filename}`,filename,width,height,bytes:bytes.length,sha256:hash(bytes),alt:`${d.visual} Printed text: ${checks.text.replace(/\s+/g,' ').trim()}`,text:checks.text,phase:'reservations_open',proposed_publish_date:d.publish_date,event_date:'2026-12-06',timezone:'America/Chicago',target:'https://www.twistedpin.com/jingle-bowl/',status:'prepared_artwork_for_review_not_scheduled_or_published',source_asset_tokens:[...d.assets,d.light?'LOGO_INDIGO':'LOGO_WHITE','DISPLAY_FONT','UI_FONT','BODY_FONT'],house_margins:margins,...(format==='story'?{suggested_link_sticker_area:{x:260,y:1620,width:560,height:110}}:{}),checks:{...checks,overlapping_copy_pairs:overlaps}});
    await page.close();console.log(`${filename}: ${width}x${height}`);
  }
  const toData=async path=>`data:image/png;base64,${(await readFile(resolve(pack,path))).toString('base64')}`;
  const cards=await Promise.all(records.map(async r=>`<article><h2>${r.proposed_publish_date} · ${r.format}</h2><img src="${await toData(r.path)}"></article>`));
  const page=await browser.newPage({viewport:{width:1544,height:100},deviceScaleFactor:1});
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#141d21;color:#f4ead6;font-family:Arial;padding:24px}.grid{display:grid;grid-template-columns:repeat(4,360px);gap:20px}article{margin:0}h2{font-size:18px;font-weight:normal;height:28px;margin:4px 0 12px}img{width:360px;display:block}</style><div class="grid">${cards.join('')}</div>`);
  await page.evaluate(async()=>Promise.all([...document.images].map(x=>x.decode())));
  await page.screenshot({path:resolve(dir,'contact-sheet-phone.png'),fullPage:true});
  await page.close();
} finally {await browser.close()}
if(networkRequests)throw Error(`Unexpected network requests: ${networkRequests}`);
const manifest={
  event:'jingle-bowl-2026',event_date:'2026-12-06',phase:'reservations_open',status:'Prepared for review and dated-folder assembly; no publication or scheduling.',
  path_base:'Context/marketing/holiday-drip-2026',
  source_template:{path:templatePath,sha256:textHash(source),hash_normalization:'UTF-8 with LF line endings'},
  renderer:{path:relative(repo,fileURLToPath(import.meta.url)).replaceAll('\\','/'),sha256:textHash(await readFile(fileURLToPath(import.meta.url),'utf8')),hash_normalization:'UTF-8 with LF line endings'},
  method:'Editable HTML/CSS/SVG layouts around tracked source rasters. Actual venue photos remain unchanged; Santa uses the owner-requested built-in imagegen grip correction, documented in artwork/santa-grip-correction.provenance.json. Images are uniformly scaled and viewport-cropped where needed. No composited fake venue scene, generated guest or generated food photograph. Original SVG mug is symbolic line art. Separate feed and Story composition rules.',
  source_assets:sourceAssets,
  facts:['src/pages/jingle-bowl.astro','Context/jingle-bowl-2026/delivery/recommended-copy.txt','Context/marketing/holiday-drip-2026/creative-brief.md','Context/marketing/holiday-drip-2026/campaign.json'],
  reproduction:['npm ci','npx playwright install chromium','node scripts/render-holiday-series-jingle.mjs'],
  tool_versions:{node:process.version,playwright:require('playwright/package.json').version,sharp:require('sharp/package.json').version},
  limitations:['House margins are composition choices, not platform guarantees.','Actual Facebook/Instagram preview and link sticker placement remain publishing checks.','Check current booking availability before every booking invitation; Nov27 comparison requires both settings to remain relevant.','December4 is the final campaign invitation, not the booking deadline.','No actual Jingle event or Santa appearance photograph is represented by the reused illustrations.'],
  phone_preview:'series/jingle/contact-sheet-phone.png',network_requests:networkRequests,records,
};
await writeFile(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(dir,'README.md'),`# Jingle Bowl: six remaining dates\n\nSix distinct editable compositions, each in 1080×1350 feed and 1080×1920 Story. These artwork files are prepared for the coordinated campaign; nothing is scheduled or published.\n\nEdit artwork.html, then run \`node scripts/render-holiday-series-jingle.mjs\` from the Website repository. Install the locked dependencies and bundled Chromium first if needed. The renderer embeds tracked source assets and fonts, blocks external requests and writes exports, manifest.json and a 360-pixel-wide phone contact sheet.\n\nThe manifest is the integration contract: records[].calendar_id, format, path (relative to the campaign folder), width, height, sha256, alt, text and phase. It also records the exact input assets, provenance and reproduction steps.\n\nThe actual bowling and suite photos retain their original pixels. Santa uses the approved illustration with the owner-requested finger/thumb-hole correction; prior master retained. The cocoa piece uses symbolic code-native line art and typography, not a food-product photograph. The package quantities remain per lane. The grip correction used built-in imagegen. Exact edit prompts, references and selected masters are preserved in artwork/santa-grip-correction.provenance.json at the campaign root.\n\nStory controls and a native link sticker must be checked in the actual app. Suggested sticker area: x260 y1620, 560×110. Verify availability before booking invitations; December4 is not a booking deadline.\n`);
