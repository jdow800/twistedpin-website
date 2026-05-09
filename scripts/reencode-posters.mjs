/**
 * Twisted Pin — poster re-encode pass (one-off optimization)
 *
 * Re-encodes existing video posters at lower quality. Posters are
 * only visible for ~200-500ms before the autoplay video covers them
 * (and on Slow 4G, the eager hero poster is the LCP element). At
 * that flash visibility, the difference between quality 80 webp and
 * quality 65 webp is imperceptible — but the byte savings (typically
 * 25-35% per file) directly improves LCP on slow connections.
 *
 * Sources for these posters live in Context/pictures/ which is
 * gitignored and not in every worktree. This script re-encodes in
 * place from the existing optimized outputs (lossy→lossy). At a
 * single quality-step reduction this is well within libwebp's
 * graceful degradation range and visually equivalent. If a future
 * pass needs higher fidelity, re-run the original poster pipeline
 * from the original sources.
 *
 * Run: `node scripts/reencode-posters.mjs`
 */
import { stat, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TARGETS = [
  // Hero posters — LCP-critical on mobile, important on desktop too.
  { file: "public/hero/hero-poster.webp",          format: "webp", quality: 65 },
  { file: "public/hero/hero-poster.jpg",           format: "jpg",  quality: 78 },
  { file: "public/hero/hero-desktop-poster.webp",  format: "webp", quality: 65 },
  { file: "public/hero/hero-desktop-poster.jpg",   format: "jpg",  quality: 78 },

  // Section videos — lazy-loaded, but trim where we can.
  { file: "public/snap/beerwall-poster.webp",         format: "webp", quality: 65 },
  { file: "public/snap/beerwall-poster.jpg",          format: "jpg",  quality: 78 },
  { file: "public/snap/buffet-poster.webp",           format: "webp", quality: 65 },
  { file: "public/snap/buffet-poster.jpg",            format: "jpg",  quality: 78 },
  { file: "public/snap/cocktails-hero-poster.webp",   format: "webp", quality: 65 },
  { file: "public/snap/cocktails-hero-poster.jpg",    format: "jpg",  quality: 78 },
  { file: "public/snap/arcade-poster.webp",           format: "webp", quality: 65 },
  { file: "public/snap/arcade-poster.jpg",            format: "jpg",  quality: 78 },
  { file: "public/snap/hiring-poster.webp",           format: "webp", quality: 65 },
  { file: "public/snap/hiring-poster.jpg",            format: "jpg",  quality: 78 },
  { file: "public/snap/nye-poster.webp",              format: "webp", quality: 65 },
  { file: "public/snap/nye-poster.jpg",               format: "jpg",  quality: 78 },
];

async function reencodeOne({ file, format, quality }) {
  const fullPath = path.join(ROOT, file);
  let beforeSize;
  try { beforeSize = (await stat(fullPath)).size; }
  catch { console.warn(`[poster] SKIP ${file} — missing`); return; }

  // Read via fs.readFile so the file descriptor closes before Sharp
  // opens its own. Sharp's stream pipeline + Windows + OneDrive's
  // sync layer otherwise hold the file long enough that a subsequent
  // write to the same path errors with EPERM. fs.readFile → Buffer →
  // sharp(buf) → toBuffer → fs.writeFile is the durable pattern.
  const inputBuf = await readFile(fullPath);

  let pipeline = sharp(inputBuf);
  if (format === "webp") {
    pipeline = pipeline.webp({ quality, effort: 6 });
  } else if (format === "jpg") {
    pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
  }
  const outputBuf = await pipeline.toBuffer();
  await writeFile(fullPath, outputBuf);

  const afterSize = (await stat(fullPath)).size;
  const savings = beforeSize - afterSize;
  const pct = ((savings / beforeSize) * 100).toFixed(1);
  console.log(
    `[poster] ${file.padEnd(45)} ${(beforeSize / 1024).toFixed(0).padStart(4)} KB → ${(afterSize / 1024).toFixed(0).padStart(4)} KB  (-${pct}%)`,
  );
}

async function main() {
  let totalBefore = 0, totalAfter = 0;
  for (const target of TARGETS) {
    const fullPath = path.join(ROOT, target.file);
    try {
      const s = await stat(fullPath);
      totalBefore += s.size;
    } catch { /* skipped */ }

    await reencodeOne(target);

    try {
      const s = await stat(fullPath);
      totalAfter += s.size;
    } catch { /* skipped */ }
  }
  console.log("");
  console.log(`[poster] Total: ${(totalBefore / 1024).toFixed(0)} KB → ${(totalAfter / 1024).toFixed(0)} KB  (saved ${((totalBefore - totalAfter) / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
