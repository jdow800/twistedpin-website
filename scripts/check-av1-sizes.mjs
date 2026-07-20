/**
 * Twisted Pin — AV1-must-be-smaller-than-H.264 check.
 *
 * Every section video ships as an AV1 + an H.264 fallback, and the markup
 * lists AV1 FIRST:
 *
 *   <source data-src="…-av1-540.mp4"  type="video/mp4; codecs=av01…" />
 *   <source data-src="…-h264-540.mp4" type="video/mp4" />
 *
 * First-match-wins, so an AV1-capable browser takes the AV1. That's only a win
 * if the AV1 file is actually smaller. If it isn't, we're serving the HEAVIER
 * file to the NEWER phones — strictly worse than shipping H.264 alone.
 *
 * That silently happened for months: AV1 and H.264 crf scales differ (0-63 vs
 * 0-51), so the pipeline's shared defaults (36 / 28) were a much higher quality
 * target for AV1. It won at 1080 and lost at 540, where libaom's per-frame
 * overhead doesn't shrink with resolution. Fixed via WIDTHS[].av1Bump in
 * build-snap-videos.mjs (2026-07-20).
 *
 * Run: `node scripts/check-av1-sizes.mjs`
 * Exits 1 if any AV1 file is >= its H.264 sibling.
 */
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SNAP = path.join(ROOT, "public", "snap");

const files = await readdir(SNAP);
const av1s = files.filter((f) => /-mobile-av1-\d+\.mp4$/.test(f)).sort();

const rows = [];
for (const av1 of av1s) {
  const h264 = av1.replace("-av1-", "-h264-");
  if (!files.includes(h264)) continue;
  const [a, b] = await Promise.all([
    stat(path.join(SNAP, av1)),
    stat(path.join(SNAP, h264)),
  ]);
  const m = av1.match(/^(.*)-mobile-av1-(\d+)\.mp4$/);
  rows.push({
    name: m[1],
    width: m[2],
    av1: a.size,
    h264: b.size,
    pct: ((a.size - b.size) / b.size) * 100,
  });
}

const kb = (n) => `${Math.round(n / 1024)}K`;
const bad = rows.filter((r) => r.av1 >= r.h264);

console.log(
  `${"NAME".padEnd(20)}${"W".padEnd(6)}${"AV1".padStart(8)}${"H264".padStart(8)}${"DELTA".padStart(9)}`
);
for (const r of rows) {
  const flag = r.av1 >= r.h264 ? "  <-- AV1 BIGGER" : "";
  console.log(
    r.name.padEnd(20) +
      r.width.padEnd(6) +
      kb(r.av1).padStart(8) +
      kb(r.h264).padStart(8) +
      `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(0)}%`.padStart(9) +
      flag
  );
}

if (bad.length) {
  console.error(
    `\nFAIL: ${bad.length} AV1 file(s) are >= their H.264 fallback. ` +
      `AV1-capable phones are being served the heavier file.\n` +
      `Raise crfAv1 (or WIDTHS[].av1Bump) in scripts/build-snap-videos.mjs and re-encode.`
  );
  process.exit(1);
}
console.log(`\nOK: all ${rows.length} AV1 files are smaller than their H.264 fallback.`);
