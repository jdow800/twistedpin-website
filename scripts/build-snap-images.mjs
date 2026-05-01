/**
 * Twisted Pin — /snap-test/ image pipeline
 *
 * Source: Context/pictures/Bar - liquor wall.jpg  (1280×1600, JPEG)
 * Output: public/snap/coupon-bg-{540,1080,1280}.{webp,jpg}
 *
 * Sized for full-screen mobile (object-fit: cover). Section 2 in the snap
 * scroller — not the LCP element on the route, so quality bias is toward
 * smaller files than the hero pipeline.
 *
 * Run: `node scripts/build-snap-images.mjs`
 */
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC  = path.join(ROOT, "Context", "pictures", "Bar - liquor wall.jpg");
const OUT  = path.join(ROOT, "public", "snap");

const WIDTHS = [540, 1080, 1280];

async function main() {
  await mkdir(OUT, { recursive: true });

  const srcStat = await stat(SRC);
  const meta = await sharp(SRC).metadata();
  console.log(
    `source: ${path.basename(SRC)}  ${meta.width}×${meta.height}  ` +
    `${(srcStat.size / 1024).toFixed(1)} KB  (${meta.format})`,
  );

  for (const w of WIDTHS) {
    const webpOut = path.join(OUT, `coupon-bg-${w}.webp`);
    const jpgOut  = path.join(OUT, `coupon-bg-${w}.jpg`);

    await sharp(SRC)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 72, effort: 5 })
      .toFile(webpOut);

    await sharp(SRC)
      .resize({ width: w, withoutEnlargement: true })
      .jpeg({ quality: 76, progressive: true, mozjpeg: true })
      .toFile(jpgOut);

    const [wStat, jStat] = await Promise.all([stat(webpOut), stat(jpgOut)]);
    console.log(
      `  ${w}px  webp ${(wStat.size / 1024).toFixed(1)} KB  ` +
      `jpg ${(jStat.size / 1024).toFixed(1)} KB`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
