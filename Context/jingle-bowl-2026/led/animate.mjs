import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import sharp from 'sharp';
import jsQR from 'jsqr';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const ffmpeg=process.argv[process.argv.indexOf('--ffmpeg')+1];
if(!process.argv.includes('--ffmpeg')||!ffmpeg)throw Error('Pass --ffmpeg with the local ffmpeg executable path.');
const working=path.join(here,'working','animation');await fs.mkdir(working,{recursive:true});
const target='https://www.twistedpin.com/jingle-bowl/booking/';
const sourceAssets={
 santa:'public/jingle-bowl/santa-entrance.webp',
 logo:'Context/logos/new-logo/New Logo/Raster/Horizontal Logo/Logo_Horizontal_White.png',
 display:'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2',
 body:'node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2',
};
const assets={};
async function asset(key,mime){const b=await fs.readFile(path.join(root,sourceAssets[key]));assets[key]={path:sourceAssets[key],sha256:crypto.createHash('sha256').update(b).digest('hex')};return `data:${mime};base64,${b.toString('base64')}`;}
const santa=await asset('santa','image/webp'),logo=await asset('logo','image/png'),display=await asset('display','font/woff2'),body=await asset('body','font/woff2');
const qr=`data:image/svg+xml;base64,${(await fs.readFile(path.join(here,'jingle-booking-qr.svg'))).toString('base64')}`;
const html=`<!DOCTYPE html><html lang="en"><meta charset="utf-8"><title>Jingle Bowl LED 1920x1080</title><style>
@font-face{font-family:Display;src:url('${display}')}@font-face{font-family:Body;src:url('${body}')}*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}body{font-family:Body,Arial,sans-serif;color:#ecebe5;background:#0b2821}.canvas{position:relative;width:1920px;height:1080px;background:radial-gradient(ellipse at 24% 6%,#194f3c 0%,#103b2e 35%,#092a21 75%)}h1,p,img,.spark,.rail,.ornament,.goldline{position:absolute;margin:0}h1,.display{font-family:Display,Impact,sans-serif;font-weight:900;line-height:1;white-space:nowrap}.gold{color:#e7c889}.mint{color:#5fe3c5}.label{text-align:center}.copy{white-space:nowrap}.goldline{height:10px;left:0;right:0;top:0;background:#d7b77c}.rail{left:1278px;top:45px;bottom:45px;width:2px;background:#d5bd8540}.logo{left:72px;top:56px;width:310px;height:66px;object-fit:contain;object-position:left}.santa{left:55px;top:585px;width:430px;height:410px;object-fit:contain}.spark{font-family:Arial;color:#dfc18c;font-size:72px}.ornament{width:112px;height:112px;left:1120px;top:110px;border-radius:50%;background:radial-gradient(circle at 29% 27%,#edfaf3 0%,#b7dcba 7%,#41aa7f 24%,#237151 60%,#0a3d2c 85%);box-shadow:inset -12px -10px 19px #02191088,0 0 60px #d0bd6010;border:2px solid #c7aa6b}.ornament:before{content:'';position:absolute;left:49px;top:-112px;width:2px;height:112px;background:#cbae6c}.ornament:after{content:'';position:absolute;left:39px;top:-12px;width:25px;height:13px;background:#be9f60;border-radius:3px 3px 0 0}
</style><body><div class="canvas"><div class="goldline"></div>
<img class="logo" src="${logo}" alt="Twisted Pin">
<div class="ornament" aria-hidden="true"></div><span class="spark" style="left:1017px;top:67px">✦</span><span class="spark" style="left:1203px;top:277px;font-size:39px">✦</span>
<h1 style="left:64px;top:184px;font-size:210px">JINGLE BOWL!</h1>
<p class="display gold" style="left:72px;top:411px;font-size:79px">SUNDAY, DECEMBER 6</p>
<img class="santa" src="${santa}" alt="Santa runs into the event graphic">
<p class="display mint" style="left:550px;top:573px;font-size:70px">90 MIN BOWLING</p>
<p class="copy" style="left:550px;top:675px;font-size:45px">Pizza + soda + shoes</p>
<p class="copy" style="left:550px;top:765px;font-size:45px">Cookie &amp; cocoa bar</p>
<p class="copy" style="left:550px;top:864px;font-size:45px">Photo with Santa</p>
<p class="copy" style="left:550px;top:922px;font-size:35px">on your device</p>
<p class="copy gold" style="left:72px;top:1020px;font-size:28px">twistedpin.com/jingle-bowl</p>
<div class="rail"></div>
<p class="display gold label" style="left:1314px;top:134px;width:582px;font-size:75px">SCAN TO BOOK</p>
<img alt="QR to Jingle Bowl booking" src="${qr}" style="left:1332px;top:266px;width:540px;height:540px;image-rendering:pixelated">
<p class="copy label" style="left:1314px;top:861px;width:582px;font-size:36px">Traditional + VIP lanes</p>
<p class="copy gold label" style="left:1314px;top:932px;width:582px;font-size:35px">December 6, 2026</p>
</div></body></html>`;
await fs.writeFile(path.join(working,'poster.html'),html,'utf8');
const browser=await chromium.launch({channel:'msedge',headless:true});let network=0;
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await page.route(/^https?:/i,r=>{network++;return r.abort();});
const poster=path.join(here,'Jingle-Bowl-LED-1920x1080.png');
const base=path.join(working,'base-no-santa.png');
try{await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:poster});await page.locator('.santa').evaluate(el=>el.style.visibility='hidden');await page.screenshot({path:base});}finally{await browser.close();}
if(network)throw Error('Unexpected outbound HTTP(S)');
const video=path.join(here,'Jingle-Bowl-LED-1920x1080.mp4');
const santaFile=path.join(working,'santa.png');
await sharp(path.join(root,sourceAssets.santa)).resize(430,410,{fit:'contain',background:'#00000000'}).png().toFile(santaFile);
const duration=20,fps=30;
const filter=`[1:v]format=rgba,rotate='0.035*sin(12*t)*if(lt(t,2.8),1,0.22)':ow=450:oh=430:c=none,fade=t=out:st=18:d=2:alpha=1[santa];[0:v][santa]overlay=x='if(lt(t,2.6),-490+535*(1-pow(1-t/2.6,3)),45)':y='575-abs(sin(12*t))*if(lt(t,2.8),19,4)':shortest=1,format=yuv420p[out]`;
async function run(args){return await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,args,{windowsHide:true});let stderr='';child.stderr.on('data',b=>stderr+=b.toString());child.on('error',reject);child.on('close',code=>code===0?resolve(stderr):reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-4000)}`)));});}
console.log('Rendering 20-second silent H.264 loop...');
const encodeLog=await run(['-hide_banner','-y','-loop','1','-framerate',String(fps),'-i',base,'-loop','1','-framerate',String(fps),'-i',santaFile,'-filter_complex',filter,'-map','[out]','-t',String(duration),'-r',String(fps),'-c:v','libx264','-profile:v','high','-level','4.1','-preset','medium','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-an',video]);
await fs.writeFile(path.join(working,'encode.log'),encodeLog,'utf8');
const frames=path.join(working,'frames');await fs.mkdir(frames,{recursive:true});
await run(['-hide_banner','-y','-i',video,'-vf','fps=1','-frames:v','20',path.join(frames,'frame-%02d.png')]);
for(const t of [0,0.5,2.5,19.966667])await run(['-hide_banner','-y','-ss',String(t),'-i',video,'-frames:v','1',path.join(frames,`boundary-${String(t).replace('.','_')}.png`)]);
const checks=[];
async function decode(file,label,scale=1){let s=sharp(file);if(scale!==1)s=s.resize(Math.round(1920*scale),Math.round(1080*scale));const {data,info}=await s.ensureAlpha().raw().toBuffer({resolveWithObject:true});const result=jsQR(new Uint8ClampedArray(data),info.width,info.height,{inversionAttempts:'dontInvert'});if(result?.data!==target)throw Error(`QR decode failed: ${label}`);checks.push({name:label,result:'pass',decoded:result.data});}
await decode(poster,'Matching PNG native');await decode(poster,'Matching PNG at 50%',.5);
const frameNames=(await fs.readdir(frames)).filter(f=>f.endsWith('.png')).sort();
for(const name of frameNames){await decode(path.join(frames,name),`Encoded MP4 ${name} native`);await decode(path.join(frames,name),`Encoded MP4 ${name} at 50%`,.5);}
const visuals=['boundary-0.png','frame-02.png','frame-05.png','frame-11.png','frame-19.png','boundary-19_966667.png'];
const previews=await Promise.all(visuals.map(file=>sharp(path.join(frames,file)).resize(640,360).toBuffer()));
await sharp({create:{width:1920,height:720,channels:3,background:'#071d19'}}).composite(previews.map((input,i)=>({input,left:(i%3)*640,top:Math.floor(i/3)*360}))).png().toFile(path.join(here,'animation-frame-preview.png'));
const metadataLog=await run(['-hide_banner','-i',video,'-map','0:v:0','-f','null','-']);
if(!metadataLog.includes('1920x1080')||!metadataLog.includes('30 fps')||metadataLog.includes('Audio:'))throw Error('Encoded media metadata mismatch');
const hashes={};for(const file of [poster,video])hashes[path.basename(file)]={bytes:(await fs.stat(file)).size,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')};
const receipt={createdAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'),assets,target,width:1920,height:1080,durationSeconds:duration,framesPerSecond:fps,codec:'H.264',pixelFormat:'yuv420p',audio:false,qr:{pixels:540,modulePixels:12,errorCorrection:'Q',quietZoneModules:4,stationaryWholeLoop:true},outboundNetworkRequests:network,files:hashes,decodedVideoFrames:frameNames.length,checks,physicalWallPlaybackTested:false,physicalPhoneScanTested:false};
await fs.writeFile(path.join(here,'animation-verification.json'),JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify({files:hashes,videoFramesChecked:frameNames.length,decodeChecks:checks.length,outboundNetworkRequests:network},null,2));
