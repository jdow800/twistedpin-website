/**
 * Twisted Pin — desktop hero placeholder pipeline
 *
 * Source: Context/pictures/AIV01579.jpg (cocktail-pour, placeholder)
 * Output: public/hero/hero-desktop-{960,1280,1920}.{webp,jpg}
 *
 * Sharp probes metadata, generates derivatives at three breakpoints
 * in WebP (q80) + JPEG (q82). No full-res image enters Claude's context.
 */
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC  = path.join(ROOT, "Context", "pictures", "AIV01579.jpg");
const OUT  = path.join(ROOT, "public", "hero");

const WIDTHS = [960, 1280, 1920];

async function main() {
  await mkdir(OUT, { recursive: true });

  const srcStat = await stat(SRC);
  const meta = await sharp(SRC).metadata();
  console.log(`source: ${path.basename(SRC)}  ${meta.width}×${meta.height}  ${(srcStat.size / 1024 / 1024).toFixed(2)} MB  (${meta.format})`);

  for (const w of WIDTHS) {
    const webpOut = path.join(OUT, `hero-desktop-${w}.webp`);
    const jpgOut  = path.join(OUT, `hero-desktop-${w}.jpg`);

    await sharp(SRC)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toFile(webpOut);

    await sharp(SRC)
      .resize({ width: w, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toFile(jpgOut);

    const wp = await stat(webpOut);
    const jp = await stat(jpgOut);
    console.log(`  ${w}w  webp ${(wp.size / 1024).toFixed(0)} KB · jpg ${(jp.size / 1024).toFixed(0)} KB`);
  }

  console.log(`\ndone — outputs in ${path.relative(ROOT, OUT)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
