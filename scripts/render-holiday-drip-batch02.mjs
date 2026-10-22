import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Code-native social compositions around generated editorial artwork. No app build/deploy.
// All artwork/fonts are embedded locally; outbound page requests are blocked and counted.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = process.env.HOLIDAY_RENDER_DEPS ? resolve(process.env.HOLIDAY_RENDER_DEPS) : repo;
const require = createRequire(resolve(dependencyRoot, 'package.json'));
const { chromium } = require('playwright');
const sharp = require('sharp');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaText = text => sha(text.replace(/\r\n?/g, '\n'));
const textHashNormalization = 'UTF-8 text with LF line endings';
const pack = resolve(repo, 'Context/marketing/holiday-drip-2026/batch-02');
const output = resolve(pack, 'exports');
const templatePath = 'Context/marketing/holiday-drip-2026/batch-02/artwork/campaign.html';
const source = await readFile(resolve(repo, templatePath), 'utf8');
const assets = {
  NYE_HERO: ['Context/marketing/holiday-drip-2026/batch-02/artwork/nye-hero-v2.png', 'image/png', repo],
  JINGLE_HERO: ['Context/marketing/holiday-drip-2026/batch-02/artwork/jingle-hero-v2.png', 'image/png', repo],
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
  sourceAssets.push({ path, bytes: bytes.length, sha256: sha(bytes), ...(metadata ? { width: metadata.width, height: metadata.height } : {}) });
}
const concepts = [
  {
    id: '04-nye-mirrorball-moment', event: 'nye', hero: 'NYE_HERO', phase: 'before-reservations-open',
    destination: 'https://www.twistedpin.com/new-years-eve/',
    identity: 'NYE. DONE RIGHT.<span>DECEMBER 31, 2026</span>',
    headline: '<span>GIVE 2026 A</span><span>PROPER SEND-OFF.</span>',
    action: '<p class="status">Reservations open</p><p class="date">WEDNESDAY, NOVEMBER 18, 2026</p><p class="time">9AM CENTRAL</p><p class="url">www.twistedpin.com/new-years-eve/</p>',
    eventDate: '2026-12-31', openingAt: '2026-11-18T15:00:00Z', stickerLabel: 'See NYE details',
    alt: 'An artistic silver mirrorball shaped like a bowling ball glows in teal and gold. Give 2026 a proper send-off. NYE. Done right. December 31, 2026 at Twisted Pin. Reservations open Wednesday, November 18, 2026 at 9am Central. www.twistedpin.com/new-years-eve/',
  },
  {
    id: '05-jingle-santa-arrives', event: 'jingle', hero: 'JINGLE_HERO', phase: 'jingle-reservations-open',
    destination: 'https://www.twistedpin.com/jingle-bowl/',
    identity: 'JINGLE BOWL',
    headline: '<span>MAKE WAY</span><span>FOR SANTA.</span>',
    action: '<p class="promise">Bowling, pizza &amp; a visit with Santa.</p><p class="date">SUNDAY, DECEMBER 6, 2026</p><p class="status">Reservations open now</p><p class="url">www.twistedpin.com/jingle-bowl/</p>',
    eventDate: '2026-12-06', stickerLabel: 'Reserve Jingle Bowl',
    alt: 'An illustrated Santa carrying a green bowling ball stands among festive trees, warm lights and wrapped gifts. Make way for Santa. Jingle Bowl at Twisted Pin. Bowling, pizza and a visit with Santa. Sunday, December 6, 2026. Reservations open now at www.twistedpin.com/jingle-bowl/.',
  },
];
const formats = [
  { format: 'feed', width: 1080, height: 1350, houseMargins: { left: 70, top: 40, right: 70, bottom: 50 } },
  { format: 'story', width: 1080, height: 1920, houseMargins: { left: 70, top: 240, right: 70, bottom: 340 } },
];
await mkdir(output, { recursive: true });
const browserChannel = process.env.HOLIDAY_RENDER_BROWSER_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(browserChannel ? { channel: browserChannel } : {}) });
const toolVersions = { node: process.version, playwright: require('playwright/package.json').version, sharp: require('sharp/package.json').version, browser: browser.version(), browserChannel: browserChannel || 'bundled-chromium' };
const records = [];
let outboundNetworkRequests = 0;
try {
  for (const concept of concepts) for (const format of formats) {
    const page = await browser.newPage({ viewport: { width: format.width, height: format.height }, deviceScaleFactor: 1 });
    await page.route('**/*', route => { outboundNetworkRequests++; return route.abort(); });
    const values = { ...tokens, WIDTH: format.width, HEIGHT: format.height, EVENT: concept.event, FORMAT: format.format, HERO: tokens[concept.hero], IDENTITY: concept.identity, HEADLINE: concept.headline, ACTION: concept.action, ALT: concept.alt };
    const html = source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      if (!(key in values)) throw Error(`Missing template token ${key}`);
      return String(values[key]);
    });
    await page.setContent(html);
    await page.evaluate(async () => {
      await Promise.all(['900 100px Display', '700 30px UI', '400 30px Body'].map(font => document.fonts.load(font)));
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode()));
    });
    const checks = await page.evaluate(() => ({
      fontsLoaded: ['900 100px Display', '700 30px UI', '400 30px Body'].every(font => document.fonts.check(font)),
      canvasOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      copyBounds: [...document.querySelectorAll('[data-safe]')].map(el => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { element: el.className || el.tagName, x, y, width, height, text: el.innerText || el.alt || '' };
      }),
      imageBounds: [...document.images].map(el => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { element: el.className, x, y, width, height, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight };
      }),
    }));
    const m = format.houseMargins;
    if (!checks.fontsLoaded || checks.canvasOverflow) throw Error(`Font/canvas failure: ${concept.id} ${format.format}`);
    if (checks.copyBounds.some(r => r.x < m.left || r.y < m.top || r.x + r.width > format.width - m.right || r.y + r.height > format.height - m.bottom)) throw Error(`Copy exceeds house margins: ${concept.id} ${format.format}: ${JSON.stringify(checks.copyBounds)}`);
    if (checks.imageBounds.some(r => Math.abs(r.width / r.height - r.naturalWidth / r.naturalHeight) > .001)) throw Error(`Image stretched: ${concept.id} ${format.format}`);
    const visibleCopy = checks.copyBounds.map(r => r.text).join('\n');
    for (const required of concept.event === 'nye' ? ['DECEMBER 31, 2026', 'WEDNESDAY, NOVEMBER 18, 2026', '9AM CENTRAL', 'www.twistedpin.com/new-years-eve/'] : ['SUNDAY, DECEMBER 6, 2026', 'Reservations open now', 'www.twistedpin.com/jingle-bowl/']) {
      if (!visibleCopy.toUpperCase().includes(required.toUpperCase())) throw Error(`Required absolute fact missing: ${required}`);
    }
    const filename = `${concept.id}-${format.format}.png`;
    const png = await sharp(await page.screenshot({ type: 'png' })).png({ compressionLevel: 9 }).toBuffer();
    const metadata = await sharp(png).metadata();
    if (metadata.width !== format.width || metadata.height !== format.height || png.length > 5_000_000) throw Error(`Export dimensions/size failed: ${filename}`);
    await writeFile(resolve(output, filename), png);
    records.push({ filename, concept: concept.id, phase: concept.phase, status: 'review-draft-not-approved-scheduled-or-published', destination: concept.destination, eventDate: concept.eventDate, ...(concept.openingAt ? { openingAt: concept.openingAt } : {}), width: format.width, height: format.height, format: format.format, bytes: png.length, sha256: sha(png), alt: concept.alt, ...(format.format === 'story' ? { suggestedLinkStickerArea: { x: 260, y: 1620, width: 560, height: 110 }, stickerLabel: concept.stickerLabel } : {}), houseMargins: m, checks });
    await page.close();
    console.log(`${filename}: ${format.width}x${format.height}, ${Math.round(png.length / 1024)} KB`);
  }
} finally { await browser.close(); }
if (outboundNetworkRequests) throw Error(`Unexpected outbound network requests: ${outboundNetworkRequests}`);
await writeFile(resolve(pack, 'render-manifest.json'), JSON.stringify({
  status: 'Batch 02 new visual concepts for review. Not approved for publication, scheduled or published.',
  timezone: 'America/Chicago',
  sourceTemplate: { path: templatePath, sha256: shaText(source), hashNormalization: textHashNormalization },
  renderer: { path: relative(repo, fileURLToPath(import.meta.url)).replaceAll('\\', '/'), sha256: shaText(await readFile(fileURLToPath(import.meta.url), 'utf8')), hashNormalization: textHashNormalization },
  toolVersions, sourceAssets,
  method: 'Separate HTML/CSS feed and Story compositions around generated editorial hero images. Real supplied logo and existing approved font substitutions. Original generated masters remain unmodified; displayed at a uniform scale with layout gradients. Heroes are artistic illustrations, not photographs of the venue or documentary evidence of an event.',
  provenance: ['artwork/nye-imagegen-provenance.json', 'artwork/jingle-hero-v2.provenance.json'],
  reproduction: ['From the Website repository root, install locked dependencies with npm ci and the bundled browser with npx playwright install chromium.', 'Run node scripts/render-holiday-drip-batch02.mjs.', 'HOLIDAY_RENDER_DEPS optionally points at an existing compatible Website dependency tree; HOLIDAY_RENDER_BROWSER_CHANNEL optionally selects an installed Chromium channel.', 'Script writes only these four final PNGs and render-manifest.json under batch-02; no Website build, deployment, environment files or production access.'],
  limitations: ['House margins are design choices, not platform-certified safe zones; check actual organic Facebook/Instagram previews.', 'Story printed URLs are not clickable: publisher must add the native link sticker.', 'NYE artwork is for before November 18, 2026 at 9am Central only.', 'Jingle reservations-open wording requires a current availability check before publishing.', 'No current scarcity, party times/prices, package additions or documentary venue appearance are asserted.'],
  outboundNetworkRequests, records,
}, null, 2) + '\n');
