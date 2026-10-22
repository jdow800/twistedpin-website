import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'Jingle-Bowl-Facebook-Event-master.png');
const output = path.join(here, 'Jingle-Bowl-Facebook-Event-Cover-1920x1005.png');
const crop = path.join(here, 'QA-centered-2.7-to-1-preview.png');
const thumb = path.join(here, 'QA-centered-2.7-to-1-preview-600px.png');
const sourceMeta = await sharp(source).metadata();
// Export-only resampling: the composed master is retained unchanged.
await sharp(source).resize(1920, 1005, { fit: 'cover', position: 'centre' }).png().toFile(output);
const cropHeight = Math.round(1920 / 2.7);
await sharp(output).extract({ left: 0, top: Math.floor((1005-cropHeight)/2), width:1920, height:cropHeight }).png().toFile(crop);
await sharp(crop).resize(600).png().toFile(thumb);
const records = [];
for (const file of [source, output, crop, thumb]) {
  const data = await fs.readFile(file);
  const meta = await sharp(data).metadata();
  records.push({ file: path.basename(file), width:meta.width, height:meta.height, bytes:data.length, sha256:crypto.createHash('sha256').update(data).digest('hex') });
}
if (records[1].width !== 1920 || records[1].height !== 1005) throw Error('Unexpected export dimensions');
await fs.writeFile(path.join(here, 'verification.json'), JSON.stringify({
  generatedAt:new Date().toISOString(),
  sourceDimensions:{width:sourceMeta.width,height:sourceMeta.height},
  files:records,
  qa:'Centered 2.7:1 crop approximates the owner-supplied Facebook creation preview; it is not a guarantee of every Facebook placement.',
  postingPerformed:false
},null,2)+'\n');
console.log(JSON.stringify(records,null,2));
