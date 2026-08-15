// Booking-tile generator for the Roller reservation catalog.
// Renders branded promo tiles (Barlow Condensed Black headline, Glow accent,
// Indigo Deep scrim over a venue photo) to PNG via headless Chrome.
//
// Add/edit tiles in TILES below, then:  node scripts/booking-tiles/generate.mjs
// Output: scripts/booking-tiles/out/<id>.png  — 1200x628 (Meta 1.91:1 ad size)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = join(__dirname, 'out');
const TMP = join(__dirname, '.tmp');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// ── Brand ────────────────────────────────────────────────────────────────
const GLOW = '#4EECC4';
const WARM = '#F4EFE3';
const INDIGO_DEEP = '#0E0A1F';

// Canvas — Meta single-image link-ad size (1.91:1). Change here to retarget.
const W = 1200;
const H = 628;

// ── Tile catalog (the reusable template's data) ───────────────────────────
// duration  → big warm-white line (eyebrow above it optional)
// name      → Glow product line
// sub       → small detail line ( · separated )
// photo     → path relative to repo root
const PHOTOS = {
  ledLanes: 'Context/pictures/1smaller (1).jpg',
  ogBowl: 'public/og/og-bowl.jpg',
};

// bgSize / bgPos control the photo crop (CSS background-size / -position).
// Zoom past 100% gives horizontal pan room so a busy element (e.g. the LED
// wall's bright cyan center) can be tucked behind the text scrim.
const TILES = [
  {
    id: 'traditional-1hr',
    eyebrow: 'BOWLING',
    duration: '1 HOUR',
    name: 'TRADITIONAL LANE',
    sub: 'Up to 5 players · Shoes included',
    photo: PHOTOS.ledLanes,
    bgSize: '1620px auto',
    bgPos: '72% 50%',
  },
  {
    id: 'traditional-2hr',
    eyebrow: 'BOWLING',
    duration: '2 HOURS',
    name: 'TRADITIONAL LANE',
    sub: 'Up to 5 players · Shoes included',
    photo: PHOTOS.ledLanes,
    bgSize: '1620px auto',
    bgPos: '72% 50%',
  },
  {
    id: 'vip-suite-2hr',
    eyebrow: 'YOURS FOR THE NIGHT',
    duration: '2 HOURS',
    name: 'VIP SUITE',
    sub: 'Up to 8 players · 6 lanes set apart from the floor',
    photo: PHOTOS.ogBowl,
    bgSize: 'cover',
    bgPos: 'center 42%',
  },
];

// ── Asset embedding ───────────────────────────────────────────────────────
const dataUri = (path, mime) =>
  `data:${mime};base64,${readFileSync(resolve(ROOT, path)).toString('base64')}`;

const FONT_DISPLAY = dataUri(
  'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2',
  'font/woff2',
);
const FONT_UI = dataUri(
  'node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2',
  'font/woff2',
);
const LOGO = dataUri('public/logo/twisted-pin-horizontal-white.png', 'image/png');

// ── HTML template ─────────────────────────────────────────────────────────
const html = (t) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Barlow';src:url('${FONT_DISPLAY}') format('woff2');font-weight:900;}
@font-face{font-family:'Mont';src:url('${FONT_UI}') format('woff2');font-weight:700;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${INDIGO_DEEP};}
.card{position:relative;width:${W}px;height:${H}px;overflow:hidden;}
.photo{position:absolute;inset:0;background-repeat:no-repeat;
  background-size:${t.bgSize || 'cover'};background-position:${t.bgPos || 'center 42%'};}
/* legibility scrim: strong on the left where copy lives, fades right */
.scrim{position:absolute;inset:0;background:
  linear-gradient(90deg, rgba(14,10,31,.92) 0%, rgba(14,10,31,.78) 34%, rgba(14,10,31,.32) 68%, rgba(14,10,31,.10) 100%),
  linear-gradient(0deg, rgba(14,10,31,.55) 0%, rgba(14,10,31,0) 40%);}
.frame{position:absolute;inset:0;box-shadow:inset 0 0 0 1px rgba(244,239,227,.10);}
.content{position:absolute;left:56px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;
  padding-left:28px;border-left:4px solid ${GLOW};box-shadow:-1px 0 18px -2px rgba(78,236,196,.55);}
.logo{position:absolute;left:56px;top:40px;height:38px;width:auto;opacity:.96;}
.eyebrow{font-family:'Mont';font-weight:700;font-size:17px;letter-spacing:.30em;color:${GLOW};
  text-transform:uppercase;margin-bottom:9px;}
.duration{font-family:'Barlow';font-weight:900;font-size:118px;line-height:.82;color:${WARM};
  letter-spacing:-.01em;text-transform:uppercase;text-shadow:0 2px 30px rgba(0,0,0,.45);}
.name{font-family:'Barlow';font-weight:900;font-size:56px;line-height:.92;color:${GLOW};
  letter-spacing:.005em;text-transform:uppercase;margin-top:5px;text-shadow:0 2px 24px rgba(0,0,0,.4);}
.sub{font-family:'Mont';font-weight:700;font-size:20px;letter-spacing:.005em;color:${WARM};
  margin-top:18px;opacity:.95;}
</style></head><body>
<div class="card">
  <div class="photo" style="background-image:url('${dataUri(t.photo, 'image/jpeg')}')"></div>
  <div class="scrim"></div>
  <div class="frame"></div>
  <img class="logo" src="${LOGO}" alt="">
  <div class="content">
    ${t.eyebrow ? `<div class="eyebrow">${t.eyebrow}</div>` : ''}
    <div class="duration">${t.duration}</div>
    <div class="name">${t.name}</div>
    ${t.sub ? `<div class="sub">${t.sub}</div>` : ''}
  </div>
</div>
</body></html>`;

// ── Render ────────────────────────────────────────────────────────────────
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('No Chrome/Edge found for headless render');

for (const t of TILES) {
  const htmlPath = join(TMP, `${t.id}.html`);
  const pngPath = join(OUT, `${t.id}.png`);
  writeFileSync(htmlPath, html(t));
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${W},${H}`,
    `--screenshot=${pngPath}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'pipe' });
  console.log(`✓ ${t.id}.png`);
}
console.log(`\nDone → ${OUT}`);
