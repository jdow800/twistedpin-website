import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Network-free review artwork only. Does not build/deploy the site or read environment files.
// Optional module root supports a prepared local dependency folder without changing shared checkouts.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = process.env.HOLIDAY_RENDER_DEPS ? resolve(process.env.HOLIDAY_RENDER_DEPS) : repo;
const requireDependency = createRequire(resolve(dependencyRoot, 'package.json'));
const sharp = requireDependency('sharp');
const { chromium } = requireDependency('playwright');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashText = text => hash(text.replace(/\r\n?/g, '\n'));
const textHashNormalization = 'UTF-8 text with LF line endings';
const pack = resolve(repo, 'Context/marketing/holiday-drip-2026');
const output = resolve(pack, 'exports');
const sourcePath = 'Context/marketing/holiday-drip-2026/artwork/nye.html';
const source = await readFile(resolve(repo, sourcePath), 'utf8');
const mirrorSourcePath = 'Context/marketing/nye-2026/artwork/campaign.html';
const mirrorSource = await readFile(resolve(repo, mirrorSourcePath), 'utf8');
const mirror = mirrorSource.match(/<svg class="mirror"[\s\S]*?<\/svg>/)?.[0];
if (!mirror) throw new Error('Approved Mirrorball SVG missing');
const assets = {
  PHOTO: ['public/snap/nye-reserve-hero-1600.webp', 'image/webp', repo],
  LOGO: ['public/logo/twisted-pin-horizontal-white.png', 'image/png', repo],
  DISPLAY_FONT: ['node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2', 'font/woff2', dependencyRoot],
  UI_FONT: ['node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2', 'font/woff2', dependencyRoot],
  BODY_FONT: ['node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2', 'font/woff2', dependencyRoot],
};
const replacements = { MIRRORBALL: mirror };
const sourceAssets = [];
for (const [token, [path, mime, assetRoot]] of Object.entries(assets)) {
  const bytes = await readFile(resolve(assetRoot, path));
  replacements[token] = `data:${mime};base64,${bytes.toString('base64')}`;
  sourceAssets.push({ path, sha256: hash(bytes) });
}
const concepts = [
  {
    name: '01-nye-set-the-clock', css: 'clock', proposedPublicationDate: '2026-10-28',
    headline: '<span>SET THE</span><span class="accent">CLOCK.</span>',
    alt: 'Twisted Pin NYE. Done right. Set the clock. New Year’s Eve is December 31, 2026. Reservations open Wednesday, November 18, 2026 at 9am. A silver Mirrorball above a real bowling party. www.twistedpin.com/new-years-eve/',
  },
  {
    name: '03-nye-usually-sells-out', css: 'sellout', proposedPublicationDate: '2026-11-09',
    headline: '<span>OUR NYE PARTIES</span><span>USUALLY</span><span class="accent">SELL OUT.</span>',
    alt: 'Twisted Pin NYE. Done right. Our NYE parties usually sell out. New Year’s Eve is December 31, 2026. Reservations open Wednesday, November 18, 2026 at 9am. Silver Mirrorball and real bowling-party photograph. www.twistedpin.com/new-years-eve/',
  },
];
const formats = [
  { name: 'feed', width: 1080, height: 1350 },
  { name: 'story', width: 1080, height: 1920 },
];
await mkdir(output, { recursive: true });
const browserChannel = process.env.HOLIDAY_RENDER_BROWSER_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(browserChannel ? { channel: browserChannel } : {}) });
const toolVersions = {
  node: process.version,
  playwright: requireDependency('playwright/package.json').version,
  sharp: requireDependency('sharp/package.json').version,
  browser: browser.version(),
  browserChannel: browserChannel || 'bundled-chromium',
};
const records = [];
try {
  for (const concept of concepts) for (const format of formats) {
    const page = await browser.newPage({ viewport: { width: format.width, height: format.height }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    const values = { ...replacements, WIDTH: format.width, HEIGHT: format.height, FORMAT: format.name, CONCEPT: concept.css, HEADLINE: concept.headline, ALT: concept.alt };
    const html = source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`Missing template token: ${key}`);
      return String(values[key]);
    });
    await page.setContent(html);
    await page.evaluate(async () => {
      await Promise.all(['900 100px Barlow', '700 24px Montserrat', '400 24px Slab'].map(font => document.fonts.load(font)));
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
      openingWording: document.querySelector('.action').innerText,
      eventWording: document.querySelector('.event').innerText,
    }));
    if (!checks.fonts || checks.overflow || checks.bounds.some(r => r.x < 0 || r.y < 0 || r.x + r.width > format.width || r.y + r.height > format.height)) throw new Error(`Canvas/font check failed: ${concept.name} ${format.name}: ${JSON.stringify(checks)}`);
    if (/\b(?:central|cst|cdt|ct|utc)\b|America\/Chicago/i.test(checks.openingWording + ' ' + concept.alt)) throw new Error(`Guest-facing timezone label: ${concept.name}`);
    // House margins; actual platform UI/crop is still a publishing-stage check.
    if (format.name === 'story' && checks.bounds.some(r => r.x < 70 || r.y < 250 || r.x + r.width > 1010 || r.y + r.height > 1530)) throw new Error(`Story text exceeds house margins: ${concept.name}`);
    const filename = `${concept.name}-${format.name}.png`;
    const png = await sharp(await page.screenshot({ type: 'png' })).png({ compressionLevel: 9 }).toBuffer();
    if (png.length > 5_000_000) throw new Error(`Export larger than 5 MB: ${filename}`);
    const metadata = await sharp(png).metadata();
    if (metadata.width !== format.width || metadata.height !== format.height) throw new Error(`Wrong export dimensions: ${filename}`);
    await writeFile(resolve(output, filename), png);
    records.push({ filename, concept: concept.name, phase: 'before-reservations-open', status: 'review-draft-not-approved-scheduled-or-published', proposedPublicationDate: concept.proposedPublicationDate, format: format.name, width: format.width, height: format.height, bytes: png.length, sha256: hash(png), alt: concept.alt, ...(format.name === 'story' ? { suggestedLinkStickerArea: { x: 260, y: 1580, width: 560, height: 130 }, stickerLabel: 'See NYE details' } : {}), checks });
    await page.close();
    console.log(`${filename} ${format.width}x${format.height} ${Math.round(png.length / 1024)} KB`);
  }
} finally {
  await browser.close();
}
await writeFile(resolve(pack, 'nye-manifest.json'), JSON.stringify({
  status: 'Review batch only. No publication or scheduling.',
  timezone: 'America/Chicago',
  destination: 'https://www.twistedpin.com/new-years-eve/',
  openingAt: '2026-11-18T15:00:00Z',
  eventDate: '2026-12-31',
  useBeforeOpeningOnly: true,
  source: { path: sourcePath, sha256: hashText(source), hashNormalization: textHashNormalization },
  mirrorball: { path: mirrorSourcePath, sourceSha256: hashText(mirrorSource), svgSha256: hashText(mirror), hashNormalization: textHashNormalization, treatment: 'Unmodified approved SVG drawing; positioned independently for each portrait composition.' },
  renderer: { path: 'scripts/render-holiday-drip-nye.mjs', sha256: hashText(await readFile(fileURLToPath(import.meta.url), 'utf8')), hashNormalization: textHashNormalization },
  toolVersions,
  sourceAssets,
  reproduction: ['Install the Website locked dependencies (npm ci), then install the matching bundled browser with npx playwright install chromium.', 'Run node scripts/render-holiday-drip-nye.mjs from the Website worktree. Bundled Chromium is the default; HOLIDAY_RENDER_BROWSER_CHANNEL optionally selects another installed Chromium channel.', 'Alternatively set HOLIDAY_RENDER_DEPS to an existing prepared dependency root containing node_modules, sharp, Playwright and the three @fontsource packages.', 'Renderer blocks browser network requests and writes only four NYE PNGs and this manifest in the new holiday-drip-2026 folder.'],
  limits: ['House Story margins are not a platform-certified safe zone.', 'Inspect actual feed/Story crop, overlays and link sticker before publishing.', 'Dates are absolute: no relative-day countdown appears.', 'Historical sellout wording is supported by Jon and makes no current-inventory claim.'],
  records,
}, null, 2) + '\n');
console.log(`Wrote four NYE review exports and manifest in ${relative(repo, pack)}`);
