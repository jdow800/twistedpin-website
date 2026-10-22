// Compression/export only. Visual text edits were made with the built-in image_gen tool.
import sharp from 'sharp';
import {copyFile,stat} from 'node:fs/promises';
const square='Context/jingle-bowl-2026/artwork/jingle-square-santa-visit-master.png';
const wide='Context/jingle-bowl-2026/artwork/jingle-wide-santa-visit-master.png';
await copyFile(square,'public/jingle-bowl/jingle-square.png');
await sharp(square).resize(1000,1000,{fit:'fill'}).webp({quality:82,effort:6}).toFile('public/jingle-bowl/jingle-square.webp');
await sharp(wide).resize(1200,630,{fit:'fill'}).png({compressionLevel:9}).toFile('public/jingle-bowl/jingle-wide.png');
await sharp(wide).resize(1200,630,{fit:'fill'}).webp({quality:82,effort:6}).toFile('public/jingle-bowl/jingle-wide.webp');
for(const name of ['jingle-square.png','jingle-square.webp','jingle-wide.png','jingle-wide.webp']){
  const file='public/jingle-bowl/'+name;
  const {width,height}=await sharp(file).metadata();
  console.log(JSON.stringify({file,width,height,bytes:(await stat(file)).size}));
}
