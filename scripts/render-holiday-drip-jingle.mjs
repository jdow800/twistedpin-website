import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Artwork only: embedded local assets, blocked network, no app build or runtime access.
// Optional HOLIDAY_RENDER_DEPS points at an existing Website dependency tree.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = process.env.HOLIDAY_RENDER_DEPS ? resolve(process.env.HOLIDAY_RENDER_DEPS) : repo;
const require = createRequire(resolve(dependencyRoot, 'package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');
const pack = resolve(repo, 'Context/marketing/holiday-drip-2026');
const output = resolve(pack, 'exports');
const templatePath = 'Context/marketing/holiday-drip-2026/artwork/jingle.html';
const source = await readFile(resolve(repo, templatePath), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaText = text => sha(text.replace(/\r\n?/g, '\n'));
const textHashNormalization = 'UTF-8 text with LF line endings';
const assets = {
  SANTA: ['Context/marketing/holiday-drip-2026/artwork/santa-entrance-v2-grip-corrected.png', 'image/png', repo],
  LOGO: ['public/logo/twisted-pin-horizontal-white.png', 'image/png', repo],
  DISPLAY_FONT: ['node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2', 'font/woff2', dependencyRoot],
  UI_FONT: ['node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2', 'font/woff2', dependencyRoot],
  BODY_FONT: ['node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2', 'font/woff2', dependencyRoot],
};
const tokens = {}, sourceAssets = [];
for (const [token, [path, mime, assetRoot]] of Object.entries(assets)) {
  const bytes = await readFile(resolve(assetRoot, path));
  tokens[token] = `data:${mime};base64,${bytes.toString('base64')}`;
  const metadata = mime.startsWith('image/') ? await sharp(bytes).metadata() : null;
  sourceAssets.push({ path, bytes: bytes.length, sha256: sha(bytes), ...(metadata ? {width: metadata.width, height: metadata.height} : {}) });
}
await mkdir(output, { recursive: true });
const formats = [
  { format: 'feed', width: 1080, height: 1350, houseMargins: { left: 70, top: 50, right: 70, bottom: 50 } },
  { format: 'story', width: 1080, height: 1920, houseMargins: { left: 70, top: 250, right: 70, bottom: 320 } },
];
const alt = 'Santa’s coming. Let’s roll. Jingle Bowl at Twisted Pin, Sunday, December 6, 2026. Bowling, pizza & a visit with Santa. Reservations open now at www.twistedpin.com/jingle-bowl/. Illustrated Santa in a red suit carries a green bowling ball.';
const browserChannel = process.env.HOLIDAY_RENDER_BROWSER_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(browserChannel ? { channel: browserChannel } : {}) });
const toolVersions = {
  node: process.version,
  playwright: require('playwright/package.json').version,
  sharp: require('sharp/package.json').version,
  browser: browser.version(),
  browserChannel: browserChannel || 'bundled-chromium',
};
const records = [];
let outboundNetworkRequests = 0;
try {
  for (const format of formats) {
    const page = await browser.newPage({ viewport: { width: format.width, height: format.height }, deviceScaleFactor: 1 });
    await page.route(/^https?:/i, route => { outboundNetworkRequests++; return route.abort(); });
    const values = { ...tokens, WIDTH: format.width, HEIGHT: format.height, FORMAT: format.format, ALT: alt };
    const html = source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      if (!(key in values)) throw Error(`Missing template token ${key}`);
      return String(values[key]);
    });
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode()));
    });
    const checks = await page.evaluate(() => ({
      fontsLoaded: ['900 100px Display', '700 30px UI', '400 30px Body'].every(font => document.fonts.check(font)),
      canvasOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      copyBounds: [...document.querySelectorAll('[data-safe]')].map(el => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { element: el.className, x, y, width, height, text: el.innerText || el.alt || '' };
      }),
      imageBounds: [...document.images].map(el => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { element: el.className, x, y, width, height, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight };
      }),
    }));
    const m = format.houseMargins;
    if (!checks.fontsLoaded || checks.canvasOverflow) throw Error(`Font/canvas failure: ${format.format}`);
    if (checks.copyBounds.some(r => r.x < m.left || r.y < m.top || r.x + r.width > format.width - m.right || r.y + r.height > format.height - m.bottom)) throw Error(`Copy exceeds house margins: ${format.format}: ${JSON.stringify(checks.copyBounds)}`);
    if (checks.imageBounds.some(r => r.x < 0 || r.y < 0 || r.x + r.width > format.width || r.y + r.height > format.height || Math.abs(r.width / r.height - r.naturalWidth / r.naturalHeight) > .001)) throw Error(`Image clipped or stretched: ${format.format}`);
    const filename = `02-jingle-santa-coming-${format.format}.png`;
    const png = await sharp(await page.screenshot({ type: 'png' })).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(resolve(output, filename), png);
    records.push({ filename, concept: '02-jingle-santa-coming', phase: 'jingle-reservations-open', publicationStatus: 'review draft; not approved, scheduled or published', width: format.width, height: format.height, format: format.format, bytes: png.length, sha256: sha(png), alt, target: 'https://www.twistedpin.com/jingle-bowl/', houseMargins: m, checks });
    await page.close();
    console.log(`${filename}: ${format.width}x${format.height}, ${Math.round(png.length / 1024)} KB`);
  }
} finally { await browser.close(); }
if (outboundNetworkRequests) throw Error(`Unexpected outbound network requests: ${outboundNetworkRequests}`);
await writeFile(resolve(pack, 'jingle-manifest.json'), JSON.stringify({
  status: 'Reviewable new compositions using approved source artwork; not newly approved for publishing.',
  event: { date: '2026-12-06', timezone: 'America/Chicago', phase: 'Reservations are open; this is not an opening-countdown campaign.' },
  sourceTemplate: { path: templatePath, sha256: shaText(source), hashNormalization: textHashNormalization },
  renderer: { path: relative(repo, fileURLToPath(import.meta.url)).replaceAll('\\', '/'), sha256: shaText(await readFile(fileURLToPath(import.meta.url), 'utf8')), hashNormalization: textHashNormalization },
  toolVersions,
  method: 'HTML/CSS compositions around the approved Santa illustration with the owner-requested grip correction made through built-in imagegen. Prior master retained; corrected transparent raster is uniformly scaled. Supplied logo remains unchanged. See artwork/santa-grip-correction.provenance.json.',
  sourceAssets,
  facts: ['Context/session-handoffs/2026-10-22-jingle-closeout.md', 'Context/jingle-bowl-2026/delivery/recommended-copy.txt', 'Context/jingle-bowl-2026/README.md', 'src/pages/jingle-bowl.astro'],
  reproduction: ['Install the Website locked dependencies (npm ci), then install the matching bundled browser with npx playwright install chromium. Alternatively set HOLIDAY_RENDER_DEPS to an existing compatible Website dependency tree.', 'Run node scripts/render-holiday-drip-jingle.mjs from the Website repository. Bundled Chromium is the default; HOLIDAY_RENDER_BROWSER_CHANNEL optionally selects another installed Chromium channel.', 'Inspect both full-size PNG exports. Use actual Facebook/Instagram upload previews before publishing.'],
  limitations: ['House margins are composition choices, not platform-certified safe zones.', 'No actual Facebook or Instagram upload/reposition preview was performed.', 'The Story leaves bottom space for a publisher-added link sticker; the exported URL is text, not a clickable sticker.', 'Current inventory was not queried. Confirm that reservations remain available before publishing the reservations-open CTA.'],
  outboundNetworkRequests,
  records,
}, null, 2) + '\n');
