import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import sharp from 'sharp';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const target='https://www.twistedpin.com/jingle-bowl/booking/';
const working=path.join(here,'working');
await fs.mkdir(working,{recursive:true});
const nativeDir=path.join(here,'optional-native');
await fs.mkdir(nativeDir,{recursive:true});
const assets={
  santa:'public/jingle-bowl/santa-entrance.webp',
  logo:'Context/logos/new-logo/New Logo/Raster/Horizontal Logo/Logo_Horizontal_White.png',
  display:'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2',
  body:'node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2',
};
const hashes={};
async function uri(key,mime){const b=await fs.readFile(path.join(root,assets[key]));hashes[key]={path:assets[key],sha256:crypto.createHash('sha256').update(b).digest('hex')};return `data:${mime};base64,${b.toString('base64')}`;}
const santa=await uri('santa','image/webp');
const logo=await uri('logo','image/png');
const display=await uri('display','font/woff2');
const body=await uri('body','font/woff2');
const qr=await QRCode.toString(target,{type:'svg',errorCorrectionLevel:'Q',margin:4,color:{dark:'#000000',light:'#ffffff'}});
await fs.writeFile(path.join(here,'jingle-booking-qr.svg'),qr,'utf8');
await QRCode.toFile(path.join(here,'jingle-booking-qr.png'),target,{type:'png',width:900,margin:4,errorCorrectionLevel:'Q',color:{dark:'#000000',light:'#ffffff'}});
const qrData=`data:image/svg+xml;base64,${Buffer.from(qr).toString('base64')}`;
const css=`@font-face{font-family:Display;src:url('${display}')}@font-face{font-family:Body;src:url('${body}')}*{box-sizing:border-box}html,body{margin:0;background:#091f1c}body{font-family:Body,Arial,sans-serif;color:#fff5df}.canvas{position:relative;overflow:hidden;background:radial-gradient(ellipse at 29% 0%,#184a38 0%,#0c2a23 58%,#071d19 100%)}.gold{color:#edcd89}.mint{color:#5ff1d2}.logo,.santa,.qr{position:absolute;display:block}.logo{object-fit:contain;object-position:left}.qr{image-rendering:pixelated;background:#fff}.display{position:absolute;font-family:Display,Impact,sans-serif;font-weight:900;margin:0;line-height:.98;white-space:nowrap}.copy{position:absolute;margin:0;line-height:1.3;white-space:nowrap}.rule{position:absolute;height:3px;background:#d8b870}.label{text-align:center}.tiny{font-size:18px}.stars{position:absolute;color:#edcd89;line-height:1;font-family:Arial;font-weight:400}.qr-rail{position:absolute;top:20px;bottom:20px;width:1px;background:#b0bda149}.band{position:absolute;height:8px;background:#d9b575;top:0;left:0;right:0}`;
function native(width){
 const narrow=width<900, q=narrow?225:270, qx=width-q-28, qy=narrow?88:81;
 const heading=narrow?78:100;
 const left=narrow?24:28;
 const line=narrow?23:27;
 return {width,height:420,qr:{left:qx,top:qy,width:q,height:q},html:`<div class="canvas" style="width:${width}px;height:420px"><div class="band"></div>
 <img class="logo" alt="Twisted Pin" src="${logo}" style="left:${left}px;top:27px;width:${narrow?155:180}px;height:35px">
 <h1 class="display" style="left:${left}px;top:76px;font-size:${heading}px">JINGLE BOWL!</h1>
 <p class="display gold" style="left:${left}px;top:${narrow?167:185}px;font-size:${narrow?39:43}px">SUNDAY, DECEMBER 6</p>
 <p class="copy mint" style="left:${left}px;top:${narrow?223:245}px;font-size:${line}px">90 MINUTES OF BOWLING</p>
 <p class="copy" style="left:${left}px;top:${narrow?263:286}px;font-size:${narrow?22:25}px">Pizza + soda + shoes</p>
 <p class="copy" style="left:${left}px;top:${narrow?304:326}px;font-size:${narrow?21:23}px">Cookie &amp; cocoa bar</p>
 <p class="copy" style="left:${left}px;top:${narrow?346:365}px;font-size:${narrow?19:22}px">Santa photo on your device</p>
 ${narrow?'':`<img class="santa" alt="" src="${santa}" style="left:465px;top:213px;width:185px;height:176px;object-fit:contain"><span class="stars" style="left:631px;top:195px;font-size:42px">✦</span>`}
 <div class="qr-rail" style="left:${qx-19}px"></div>
 <p class="display gold label" style="left:${qx-10}px;top:29px;width:${q+20}px;font-size:${narrow?32:35}px">SCAN TO BOOK</p>
 <img class="qr" alt="QR code to Jingle Bowl booking" src="${qrData}" style="left:${qx}px;top:${qy}px;width:${q}px;height:${q}px">
 <p class="copy label" style="left:${qx-10}px;top:${narrow?332:364}px;width:${q+20}px;font-size:${narrow?18:18}px">Traditional + VIP</p>
 <p class="copy label gold" style="left:${qx-10}px;top:${narrow?363:390}px;width:${q+20}px;font-size:${narrow?16:14}px">December 6, 2026</p>
 </div>`};
}
function standard(){return {width:1280,height:720,qr:{left:878,top:178,width:360,height:360},html:`<div class="canvas" style="width:1280px;height:720px"><div class="band"></div>
 <img class="logo" alt="Twisted Pin" src="${logo}" style="left:44px;top:38px;width:224px;height:47px">
 <span class="stars" style="left:790px;top:37px;font-size:55px">✦</span>
 <h1 class="display" style="left:40px;top:116px;font-size:145px">JINGLE BOWL!</h1>
 <p class="display gold" style="left:44px;top:272px;font-size:60px">SUNDAY, DECEMBER 6</p>
 <p class="copy mint" style="left:46px;top:365px;font-size:34px">90 MINUTES OF BOWLING</p>
 <p class="copy" style="left:46px;top:421px;font-size:31px">Pizza + soda + shoes</p>
 <p class="copy" style="left:46px;top:475px;font-size:31px">Cookie &amp; cocoa bar</p>
 <p class="copy" style="left:46px;top:538px;font-size:28px">Photo with Santa</p>
 <p class="copy" style="left:46px;top:580px;font-size:25px">on your device</p>
 <img class="santa" alt="" src="${santa}" style="left:511px;top:390px;width:315px;height:300px;object-fit:contain">
 <div class="qr-rail" style="left:846px"></div>
 <p class="display gold label" style="left:867px;top:99px;width:382px;font-size:52px">SCAN TO BOOK</p>
 <img class="qr" alt="QR code to Jingle Bowl booking" src="${qrData}" style="left:878px;top:178px;width:360px;height:360px">
 <p class="copy label" style="left:867px;top:567px;width:382px;font-size:26px">Traditional + VIP lanes</p>
 <p class="copy label gold" style="left:867px;top:613px;width:382px;font-size:24px">December 6, 2026</p>
 <p class="copy" style="left:46px;top:664px;font-size:21px">twistedpin.com/jingle-bowl</p>
 </div>`};}
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({deviceScaleFactor:1});
let network=0;
await page.route(/^https?:/i,route=>{network++;return route.abort();});
const checks=[];
const exports=[];
async function render(name,design){
 const html=`<!DOCTYPE html><html lang="en"><meta charset="utf-8"><title>Jingle Bowl LED artwork</title><style>${css}</style><body>${design.html}</body></html>`;
 await fs.writeFile(path.join(working,`${name}.html`),html,'utf8');
 await page.setViewportSize({width:design.width,height:design.height});
 await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
 const bad=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.alt));
 if(bad.length)throw Error(`Missing assets: ${bad.join(',')}`);
 const intermediate=design.width===1022||design.width===789;
 const file=path.join(intermediate?working:nativeDir,`${name}.png`);await page.screenshot({path:file});
 await verify(file,name,design);
 if(!intermediate)exports.push({file:path.basename(file),width:design.width,height:design.height,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
 return file;
}
function decode(data,info,label){const found=jsQR(new Uint8ClampedArray(data),info.width,info.height,{inversionAttempts:'dontInvert'});if(found?.data!==target)throw Error(`QR decode failed: ${label}`);checks.push({name:label,result:'pass',decoded:found.data});}
async function verify(file,name,design){
 const full=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});decode(full.data,full.info,`${name}: whole native image`);
 const half=await sharp(file).resize(Math.round(design.width*.5),Math.round(design.height*.5),{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});decode(half.data,half.info,`${name}: whole image at 50%`);
 const qrPixels=await sharp(file).extract(design.qr).ensureAlpha().raw().toBuffer({resolveWithObject:true});decode(qrPixels.data,qrPixels.info,`${name}: QR crop`);
}
try{
 const standardFile=await render('Jingle-QR-1280x720-STANDARD-SCREEN',standard());
 const zoneFiles={};
 for(const width of [1023,1022,789,736])zoneFiles[width]=await render(`Jingle-QR-${width}x420-ZONE`,native(width));
 const traditional=[{x:0,w:1023},{x:1024,w:1023},{x:2048,w:1023},{x:3072,w:1023},{x:4096,w:1022},{x:5119,w:789}];
 const vip=[{x:0,w:736},{x:736,w:736},{x:1472,w:736}];
 for(const [name,width,tiles]of[['Jingle-QR-5908x448-TRADITIONAL-WALL',5908,traditional],['Jingle-QR-2210x448-VIP-WALL',2210,vip]]){
  const file=path.join(nativeDir,`${name}.png`);
  await sharp({create:{width,height:448,channels:3,background:'#000000'}}).composite(tiles.map(t=>({input:zoneFiles[t.w],left:t.x,top:0}))).png().toFile(file);
  for(let i=0;i<tiles.length;i++){const t=tiles[i];const crop=await sharp(file).extract({left:t.x,top:0,width:t.w,height:420}).ensureAlpha().raw().toBuffer({resolveWithObject:true});decode(crop.data,crop.info,`${name}: zone ${i+1} native square QR`);const half=await sharp(file).extract({left:t.x,top:0,width:t.w,height:420}).resize(Math.round(t.w/2),210).ensureAlpha().raw().toBuffer({resolveWithObject:true});decode(half.data,half.info,`${name}: zone ${i+1} at 50%`);}
  exports.push({file:path.basename(file),width,height:448,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
 }
 // Diagnostics only. These stretched files are not delivered as wall artwork.
 for(const width of [1023,1022,789,736]){
  const stretched=await sharp(standardFile).resize(width,420,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const found=jsQR(new Uint8ClampedArray(stretched.data),stretched.info.width,stretched.info.height,{inversionAttempts:'dontInvert'});
  checks.push({name:`Standard screen diagnostic: nonuniform HDMI stretch to ${width}x420`,result:found?.data===target?'pass':'not decoded',decoded:found?.data??null,recommended:false});
 }
 if(network)throw Error('Unexpected outbound network request');
 const receipt={createdAt:new Date().toISOString(),target,rendererSha256:crypto.createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'),qr:{errorCorrection:'Q',symbolModules:37,quietZoneModules:4,nativePixelsPerModule:{traditional:6,vip:5,standard:8}},outboundNetworkRequests:network,assets:hashes,exports,checks,physicalPhoneScanPerformed:false};
 await fs.writeFile(path.join(nativeDir,'verification.json'),JSON.stringify(receipt,null,2)+'\n','utf8');
 console.log(JSON.stringify({exports:exports.length,checks:checks.length,network,failedDiagnostics:checks.filter(c=>c.result!=='pass').map(c=>c.name)},null,2));
}finally{await browser.close();}
