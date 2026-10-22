import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chromium } from 'playwright';

// Local, network-free artwork renderer. No Website build, environment file or account access.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pack = resolve(repo, 'Context/marketing/nye-2026');
const output = resolve(pack, 'exports');
const source = await readFile(resolve(pack, 'artwork/campaign.html'), 'utf8');
const assets = {
  PHOTO: ['public/snap/nye-reserve-hero-1600.webp', 'image/webp'],
  LOGO: ['public/logo/twisted-pin-horizontal-white.png', 'image/png'],
  DISPLAY_FONT: ['node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2', 'font/woff2'],
  UI_FONT: ['node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2', 'font/woff2'],
  BODY_FONT: ['node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2', 'font/woff2'],
};
const replacements = {};
const sourceAssets = [];
for (const [token, [path, mime]] of Object.entries(assets)) {
  const bytes = await readFile(resolve(repo, path));
  replacements[token] = `data:${mime};base64,${bytes.toString('base64')}`;
  sourceAssets.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const formats = [
  { name: 'facebook-event', css: 'cover', width: 1920, height: 1005 },
  { name: 'feed', css: 'feed', width: 1080, height: 1350 },
  { name: 'story', css: 'story', width: 1080, height: 1920 },
  { name: 'google-event', css: 'google', width: 1200, height: 900 },
];
const phases = [
  { name: 'teaser', detail: 'NOV 18 · 9AM CENTRAL', alt: 'New Year’s Eve bowling at Twisted Pin, December 31, 2026. Reservations open November 18 at 9am Central. www.twistedpin.com/new-years-eve/' },
  { name: 'reservations-open', detail: 'CHOOSE YOUR PARTY TIME.', alt: 'New Year’s Eve bowling at Twisted Pin, December 31, 2026. Reservations open. Choose your party time at www.twistedpin.com/new-years-eve/' },
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const records = [];
try {
  for (const phase of phases) for (const format of formats) {
    const page = await browser.newPage({ viewport: { width: format.width, height: format.height }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    const values = { ...replacements, WIDTH: format.width, HEIGHT: format.height, FORMAT: format.css, DETAIL: phase.detail, ALT: phase.alt };
    const html = source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`Missing template token: ${key}`);
      return String(values[key]);
    });
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode()));
    });
    const checks = await page.evaluate(() => ({
      fonts: ['900 100px Barlow', '700 24px Montserrat', '400 24px Slab'].every(font => document.fonts.check(font)),
      bounds: [...document.querySelectorAll('[data-safe]')].filter(el => el.getClientRects().length).map(el => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { element: el.className, x, y, width, height };
      }),
      overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
    }));
    if (!checks.fonts || checks.overflow || checks.bounds.some(r => r.x < 0 || r.y < 0 || r.x + r.width > format.width || r.y + r.height > format.height)) throw new Error(`Canvas/font check failed: ${format.name} ${phase.name}`);
    // House margins, not a claim of platform-certified safe zones.
    if (format.css === 'story' && checks.bounds.some(r => r.x < 70 || r.y < 250 || r.x + r.width > 1010 || r.y + r.height > 1530)) throw new Error('Story text exceeds conservative house margins');
    const filename = `${format.name}-${phase.name}.png`;
    const png = await sharp(await page.screenshot({ type: 'png' })).png({ compressionLevel: 9 }).toBuffer();
    if (png.length > 5_000_000) throw new Error(`Export larger than 5 MB: ${filename}`);
    await writeFile(resolve(output, filename), png);
    records.push({ filename, phase: phase.name, format: format.name, width: format.width, height: format.height, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex'), alt: phase.alt, checks });
    await page.close();
    console.log(`${filename} ${format.width}×${format.height} ${Math.round(png.length / 1024)} KB`);
  }
} finally {
  await browser.close();
}
const thumbWidth = 370, thumbHeight = 500, cellWidth = 400, cellHeight = 558;
const composite = [];
for (const [index, record] of records.entries()) {
  const col = index % 4, row = Math.floor(index / 4);
  const thumb = await sharp(resolve(output, record.filename)).resize(thumbWidth, thumbHeight, { fit: 'contain', background: '#211c32' }).toBuffer();
  composite.push({ input: thumb, left: col * cellWidth + 15, top: row * cellHeight + 40 });
  const label = `<svg width="400" height="36"><text x="15" y="24" fill="#f4efe3" font-family="Arial" font-size="16">${record.format} · ${record.phase === 'teaser' ? 'teaser' : 'open'}</text></svg>`;
  composite.push({ input: Buffer.from(label), left: col * cellWidth, top: row * cellHeight });
}
await sharp({ create: { width: cellWidth * 4, height: cellHeight * 2, channels: 3, background: '#211c32' } }).composite(composite).png({ compressionLevel: 9 }).toFile(resolve(pack, 'contact-sheet.png'));
await writeFile(resolve(pack, 'export-manifest.json'), JSON.stringify({ basis: 'Website 1a5089125488694a9fe8105b3c782b6d357615c4', templateSha256: createHash('sha256').update(source).digest('hex'), sourceAssets, records }, null, 2) + '\n');
await writeFile(resolve(pack, 'review.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Twisted Pin NYE · artwork review</title><style>body{margin:0;padding:32px;background:#100b23;color:#f4efe3;font:16px/1.5 system-ui}h1{font-size:30px}p{max-width:70ch}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px}figure{margin:0}img{display:block;width:100%;height:480px;object-fit:contain;background:#211c32}a{color:#4eecc4}figcaption{padding:12px 0}</style><h1>NYE. Done right.</h1><p>Review pack only. Nothing published. Top row: before November 18, 9am Central. Second row: once reservations have opened. Open each PNG to review at full resolution. Source and publication notes: <a href="README.md">README</a>.</p><main>${records.map(r => `<figure><a href="exports/${r.filename}"><img src="exports/${r.filename}" alt="${r.alt}"></a><figcaption>${r.format} · ${r.phase} · ${r.width} × ${r.height}</figcaption></figure>`).join('')}</main></html>\n`);
console.log(`Wrote eight exports and review artifacts in ${relative(repo, pack)}`);
