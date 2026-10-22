/** Render the NYE link-preview card from the approved, code-native campaign art.
 * No account, environment file or network access; does not regenerate social exports.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const template = await readFile(resolve(root, 'Context/marketing/nye-2026/artwork/campaign.html'), 'utf8');
const values = {
  WIDTH: 1920, HEIGHT: 1008, FORMAT: 'cover',
  DETAIL: 'CELEBRATE EARLIER. OR RING IN 2027.',
  ALT: 'New Year’s Eve 2026 bowling parties at Twisted Pin in Plainfield, with a mirrorball above the lanes.',
};
const sources = {};
for (const [token, path, mime] of [
  ['PHOTO', 'public/snap/nye-reserve-hero-1600.webp', 'image/webp'],
  ['LOGO', 'public/logo/twisted-pin-horizontal-white.png', 'image/png'],
  ['DISPLAY_FONT', 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2', 'font/woff2'],
  ['UI_FONT', 'node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2', 'font/woff2'],
  ['BODY_FONT', 'node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2', 'font/woff2'],
]) {
  const bytes = await readFile(resolve(root, path));
  values[token] = `data:${mime};base64,${bytes.toString('base64')}`;
  sources[path] = createHash('sha256').update(bytes).digest('hex');
}
// An evergreen link card must not assert that sales are open or inventory remains.
assert(template.includes('<p class="status">Reservations open</p>'));
const html = template.replace('<p class="status">Reservations open</p>', '<p class="status">SIX PARTY TIMES</p>')
  .replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    assert(key in values, `Unknown artwork token ${key}`);
    return String(values[key]);
  });
const browser = await chromium.launch({ headless: true });
let bytes;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1008 }, deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  await page.setContent(html);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
  const valid = await page.evaluate(() => ['900 100px Barlow', '700 24px Montserrat', '400 24px Slab'].every(f => document.fonts.check(f))
    && [...document.querySelectorAll('[data-safe]')].every(e => { const r = e.getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
  assert(valid, 'Artwork fonts and content must fit');
  bytes = await sharp(await page.screenshot()).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
} finally { await browser.close(); }
assert(bytes.length < 300_000, 'Keep the public share card compact');
await mkdir(resolve(root, 'public/og'), { recursive: true });
await writeFile(resolve(root, 'public/og/og-nye-2026.jpg'), bytes);
const receipt = { width: 1200, height: 630, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sources,
  templateSha256: createHash('sha256').update(template).digest('hex'), label: values.DETAIL, status: 'SIX PARTY TIMES' };
await writeFile(resolve(root, 'Context/marketing/nye-2026/share-card-manifest.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
