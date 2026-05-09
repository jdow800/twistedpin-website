/**
 * Twisted Pin — OG image pipeline (per-pillar social cards)
 *
 * Encodes pillar-specific landscape source images from
 * `Context/og images/` to `public/og/og-{pillar}.jpg` at 1200×630
 * (1.91:1) — the canonical Open Graph card size used by Facebook,
 * LinkedIn, iMessage, Slack, Discord, Twitter, etc.
 *
 * Distinct from `build-snap-images.mjs`:
 *   - Single-format output (.jpg only — OG cards don't use AVIF/WebP)
 *   - Single width (1200px — every consumer scales from there)
 *   - Forced landscape 1.91:1 cover-crop with sharp's `attention`
 *     algorithm — finds the most "interesting" horizontal slice of
 *     each landscape source so the focal subject (cocktail glass,
 *     food platter, lanes, etc.) lands in the safe center area.
 *
 * Quality bias: 85 — slightly higher than snap section media because
 * social cards render at ~600px wide on phones and any compression
 * artifacts read directly. Final files land 100-200KB each.
 *
 * `Context/og images/` is gitignored (source assets stay outside the
 * repo per the existing convention); the encoded `/public/og/og-*.jpg`
 * outputs ARE committed.
 *
 * Run: `node scripts/build-og-images.mjs`
 */
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = path.join(ROOT, "Context", "og images");
const OUT_DIR = path.join(ROOT, "public", "og");

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;
const QUALITY = 85;

/**
 * Source list. `src` is the filename in Context/og images/, `name`
 * becomes the output basename (`og-{name}.jpg` in /public/og/), and
 * `pillar` is the page route the image is for — used in this file's
 * docstring + the wiring below; not read by the encoder itself.
 *
 * Ordered to match the inline-nav pillar order on the SiteHeader.
 */
const SOURCES = [
  { src: "bar cocktail.jpeg", name: "bar",       pillar: "/bar/"       },
  { src: "eat share.jpg",     name: "eat",       pillar: "/eat/"       },
  { src: "bowl.jpg",          name: "bowl",      pillar: "/bowl/"      },
  { src: "Arcade.jpg",        name: "game",      pillar: "/game/"      },
  { src: "events.jpg",        name: "events",    pillar: "/events/"    },
  { src: "vip energy.jpg",    name: "vip-suite", pillar: "/vip-suite/" },
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function encodeOne({ src, name }) {
  const srcPath = path.join(SRC_DIR, src);

  if (!(await exists(srcPath))) {
    console.warn(`[og] SKIP ${src} — source missing (Context/og images/${src})`);
    return;
  }

  const outPath = path.join(OUT_DIR, `og-${name}.jpg`);

  await sharp(srcPath)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    // mozjpeg is bundled with sharp on most platforms — slightly tighter
    // compression than libjpeg-turbo at the same visual quality.
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(outPath);

  const { size } = await stat(outPath);
  console.log(`[og] ${src.padEnd(20)} → og-${name}.jpg (${(size / 1024).toFixed(1)} KB)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const entry of SOURCES) {
    await encodeOne(entry);
  }
  console.log(`[og] Done. Output: public/og/og-{${SOURCES.map((s) => s.name).join("|")}}.jpg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
