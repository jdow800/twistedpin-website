/**
 * One-off: tighter compression on the homepage EBG cluster row images.
 *
 * Lighthouse on 2026-05-08 flagged stage-eat-540.webp (95 KB) at the
 * top of the "Improve image delivery" panel — displayed at ~399px wide
 * on desktop while the file is 540×960. The size is fine for 2× retina
 * coverage; the bytes are just higher than they need to be at quality
 * 80. Re-encode at quality 70 trades imperceptible visual quality at
 * cluster-card display dimensions for ~20-30% byte savings.
 *
 * Scoped to the stage-* and similar cluster-prominent images — other
 * snap/* assets (posters, IG grid, hero) have their own pipelines.
 *
 * Run: `node scripts/reencode-cluster-images.mjs`
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const NAMES = [
  "stage-eat-540", "stage-eat-600",
  "stage-bowl-540", "stage-bowl-600",
  "stage-game-540", "stage-game-900",
];
const TARGETS = [];
for (const n of NAMES) {
  TARGETS.push({ file: `public/snap/${n}.webp`, format: "webp", quality: 70 });
  TARGETS.push({ file: `public/snap/${n}.jpg`,  format: "jpg",  quality: 78 });
}

async function reencodeOne({ file, format, quality }) {
  const fullPath = path.join(ROOT, file);
  let inputBuf;
  try { inputBuf = await readFile(fullPath); }
  catch { console.warn(`[cluster] SKIP ${file} — missing`); return; }

  const beforeSize = inputBuf.length;
  let pipeline = sharp(inputBuf);
  if (format === "webp") {
    pipeline = pipeline.webp({ quality, effort: 6 });
  } else if (format === "jpg") {
    pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
  }
  const outputBuf = await pipeline.toBuffer();
  await writeFile(fullPath, outputBuf);

  const afterSize = outputBuf.length;
  const pct = (((beforeSize - afterSize) / beforeSize) * 100).toFixed(1);
  console.log(
    `[cluster] ${file.padEnd(45)} ${(beforeSize / 1024).toFixed(0).padStart(4)} KB → ${(afterSize / 1024).toFixed(0).padStart(4)} KB  (-${pct}%)`,
  );
}

async function main() {
  let total = 0, totalAfter = 0;
  for (const target of TARGETS) {
    const fullPath = path.join(ROOT, target.file);
    try { total += (await stat(fullPath)).size; } catch {}
    await reencodeOne(target);
    try { totalAfter += (await stat(fullPath)).size; } catch {}
  }
  console.log("");
  console.log(`[cluster] Total: ${(total / 1024).toFixed(0)} KB → ${(totalAfter / 1024).toFixed(0)} KB  (saved ${((total - totalAfter) / 1024).toFixed(0)} KB)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
