// Mock Facebook cover crops for the three top candidates.
// Renders each at: full upload (1640x924), desktop view (820x312), mobile view (640x360).

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'C:/Users/jdow8/OneDrive/Desktop/Claude/Website/Context/Pics Social Media';
const OUT = path.join(SRC, 'fb-cover-mocks');
fs.mkdirSync(OUT, { recursive: true });

// Facebook cover specs
const UPLOAD = { w: 1640, h: 924 };       // full retina upload
const DESKTOP = { w: 820, h: 312 };       // what desktop FB displays
const MOBILE = { w: 640, h: 360 };        // what mobile FB displays

const candidates = [
  { file: 'DSC00785-Enhanced-NR.jpg', label: '1-bowler-crowd', focus: { x: 0.5, y: 0.55 } },
  { file: 'AIV08647.jpg',             label: '2-vip-suite',    focus: { x: 0.5, y: 0.45 } },
  { file: 'DSC07254.jpg',             label: '3-tap-wall',     focus: { x: 0.5, y: 0.45 } },
];

async function mockCandidate({ file, label, focus }) {
  const input = path.join(SRC, file);
  const meta = await sharp(input).metadata();
  console.log(`\n${file}: ${meta.width} x ${meta.height} (aspect ${(meta.width/meta.height).toFixed(2)}:1)`);

  const positions = {
    upload: getCoverPosition(meta, UPLOAD, focus),
    desktop: getCoverPosition(meta, DESKTOP, focus),
    mobile: getCoverPosition(meta, MOBILE, focus),
  };

  // 1. Full upload
  await sharp(input)
    .extract(positions.upload)
    .resize(UPLOAD.w, UPLOAD.h)
    .jpeg({ quality: 88 })
    .toFile(path.join(OUT, `${label}__upload-1640x924.jpg`));

  // 2. Desktop crop preview
  await sharp(input)
    .extract(positions.desktop)
    .resize(DESKTOP.w * 2, DESKTOP.h * 2) // 2x for clarity
    .jpeg({ quality: 88 })
    .toFile(path.join(OUT, `${label}__desktop-view.jpg`));

  // 3. Mobile crop preview
  await sharp(input)
    .extract(positions.mobile)
    .resize(MOBILE.w * 2, MOBILE.h * 2)
    .jpeg({ quality: 88 })
    .toFile(path.join(OUT, `${label}__mobile-view.jpg`));

  // 4. Annotated upload showing the desktop & mobile safe zones + profile-disc dodge zone
  await renderAnnotated(input, label, positions);

  console.log(`  → ${label}__upload-1640x924.jpg`);
  console.log(`  → ${label}__desktop-view.jpg`);
  console.log(`  → ${label}__mobile-view.jpg`);
  console.log(`  → ${label}__annotated.jpg`);
}

// Compute extract region from source that matches target aspect, centered on focus point.
function getCoverPosition(meta, target, focus) {
  const srcAspect = meta.width / meta.height;
  const tgtAspect = target.w / target.h;
  let cropW, cropH;
  if (srcAspect > tgtAspect) {
    // Source is wider — crop width
    cropH = meta.height;
    cropW = Math.round(cropH * tgtAspect);
  } else {
    // Source is taller — crop height
    cropW = meta.width;
    cropH = Math.round(cropW / tgtAspect);
  }
  let left = Math.round(focus.x * meta.width - cropW / 2);
  let top = Math.round(focus.y * meta.height - cropH / 2);
  left = Math.max(0, Math.min(left, meta.width - cropW));
  top = Math.max(0, Math.min(top, meta.height - cropH));
  return { left, top, width: cropW, height: cropH };
}

// Render the upload-sized image with overlays showing FB crop zones.
async function renderAnnotated(input, label, positions) {
  const base = await sharp(input)
    .extract(positions.upload)
    .resize(UPLOAD.w, UPLOAD.h)
    .toBuffer();

  // SVG overlay
  // Desktop view shows centered ratio 820:312 of the upload
  // 1640 / (820/312) = 624 vertical band -> y: 150 to 774
  const deskBand = { x: 0, y: (UPLOAD.h - 624) / 2, w: 1640, h: 624 };
  // Mobile view shows centered ratio 640:360
  // height stays at upload height? No — mobile shows roughly 1640 wide @ 924 tall scaled to 640x360 — but FB actually keeps tighter centered. Use 1280x720 centered as a reasonable approximation.
  const mob = { x: (UPLOAD.w - 1280) / 2, y: (UPLOAD.h - 720) / 2, w: 1280, h: 720 };
  // Profile disc (bottom-left, ~170x170 at 820x312, doubled to 340x340 at retina, sits over the bottom-left corner of the desktop band)
  const disc = { cx: 170, cy: deskBand.y + deskBand.h - 50, r: 170 };

  const svg = `
<svg width="${UPLOAD.w}" height="${UPLOAD.h}" xmlns="http://www.w3.org/2000/svg">
  <!-- Desktop crop band (the wider, shorter view) -->
  <rect x="${deskBand.x}" y="${deskBand.y}" width="${deskBand.w}" height="${deskBand.h}"
        fill="none" stroke="#3DD9C5" stroke-width="6" stroke-dasharray="20,12"/>
  <text x="20" y="${deskBand.y + 40}" font-family="Arial" font-size="28" font-weight="bold" fill="#3DD9C5">DESKTOP VIEW (820×312)</text>

  <!-- Mobile crop -->
  <rect x="${mob.x}" y="${mob.y}" width="${mob.w}" height="${mob.h}"
        fill="none" stroke="#FFA85C" stroke-width="6" stroke-dasharray="20,12"/>
  <text x="${mob.x + 20}" y="${mob.y + 40}" font-family="Arial" font-size="28" font-weight="bold" fill="#FFA85C">MOBILE VIEW (640×360)</text>

  <!-- Profile disc dodge zone -->
  <circle cx="${disc.cx}" cy="${disc.cy}" r="${disc.r}"
          fill="rgba(255,80,80,0.35)" stroke="#FF5050" stroke-width="4"/>
  <text x="${disc.cx - 100}" y="${disc.cy + 5}" font-family="Arial" font-size="22" font-weight="bold" fill="#FFF">PROFILE</text>
  <text x="${disc.cx - 60}" y="${disc.cy + 32}" font-family="Arial" font-size="22" font-weight="bold" fill="#FFF">DISC</text>
</svg>`;

  await sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toFile(path.join(OUT, `${label}__annotated.jpg`));
}

for (const c of candidates) {
  await mockCandidate(c);
}

console.log('\nDone. Output:', OUT);
