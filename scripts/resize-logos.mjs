/**
 * One-off: resize the brand logo files down to 2× their display size.
 *
 * Lighthouse on 2026-05-08 caught both logos at ~3× oversized:
 *   - twisted-pin-horizontal-white  597×256  (SiteHeader, height 41-56px →
 *                                              displayed ~96-131px wide)
 *   - twisted-pin-horizontal-glow   746×320  (NavDrawer, height 56-72px →
 *                                              displayed ~131-168px wide)
 *
 * Halve the source dimensions so they're still ≥2× retina at the largest
 * display size:
 *   - white.webp/png  597×256 → 280×120  (2.1× retina at 131px wide)
 *   - glow.webp/png   746×320 → 360×154  (2.1× retina at 168px wide)
 *
 * Combined savings: ~38 KB per page load on every page that renders the
 * persistent SiteHeader (every page) + ~25 KB on pages that surface the
 * NavDrawer hero glow logo (also every page).
 *
 * Run: `node scripts/resize-logos.mjs`
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TARGETS = [
  // White logo — SiteHeader. Aspect 2.33:1, target width 280.
  { file: "public/logo/twisted-pin-horizontal-white.webp", width: 280, format: "webp", quality: 90 },
  { file: "public/logo/twisted-pin-horizontal-white.png",  width: 280, format: "png" },
  // Glow logo — NavDrawer header. Aspect 2.33:1, target width 360.
  { file: "public/logo/twisted-pin-horizontal-glow.webp",  width: 360, format: "webp", quality: 90 },
  { file: "public/logo/twisted-pin-horizontal-glow.png",   width: 360, format: "png" },
];

async function resizeOne({ file, width, format, quality }) {
  const fullPath = path.join(ROOT, file);
  const inputBuf = await readFile(fullPath);
  const beforeSize = inputBuf.length;

  let pipeline = sharp(inputBuf).resize({ width, withoutEnlargement: true });
  if (format === "webp") {
    pipeline = pipeline.webp({ quality, effort: 6 });
  } else if (format === "png") {
    // Keep alpha, crank compression. Logos compress beautifully — these are
    // mostly flat color + a small mark, so PNG is appropriate; libpng's
    // higher compression level costs CPU at build time, not at request.
    pipeline = pipeline.png({ compressionLevel: 9, palette: true });
  }
  const outputBuf = await pipeline.toBuffer();
  await writeFile(fullPath, outputBuf);

  const afterSize = outputBuf.length;
  const pct = (((beforeSize - afterSize) / beforeSize) * 100).toFixed(1);
  console.log(
    `[logo] ${file.padEnd(50)} ${(beforeSize / 1024).toFixed(1).padStart(5)} KB → ${(afterSize / 1024).toFixed(1).padStart(5)} KB  (-${pct}%)`,
  );
}

async function main() {
  for (const target of TARGETS) {
    await resizeOne(target);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
