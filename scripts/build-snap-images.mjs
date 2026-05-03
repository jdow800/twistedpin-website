/**
 * Twisted Pin — /snap-test/ image pipeline
 *
 * Encodes one or more `Context/pictures/*` source files to responsive
 * `public/snap/<name>-{540,1080,1280}.{webp,jpg}` outputs. Sources missing
 * from the worktree are warned and skipped — gitignored Context/pictures/
 * isn't always populated on a fresh worktree.
 *
 * Sized for the section media (object-fit: cover). Quality bias is toward
 * smaller files than the hero pipeline since these aren't the LCP element.
 *
 * Run: `node scripts/build-snap-images.mjs`
 */
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PICS = path.join(ROOT, "Context", "pictures");
const OUT  = path.join(ROOT, "public", "snap");

const WIDTHS = [540, 1080, 1280];

/**
 * Source list. Each entry encodes to `public/snap/<name>-{w}.{webp,jpg}`
 * for each width in the entry's `widths` array (defaults to [540, 1080, 1280]).
 *
 * Optional `aspect` (e.g. "9 / 16") forces a build-time cover-crop to that
 * aspect using sharp's smart `position: 'attention'` algorithm. Without it,
 * the source's native aspect is preserved and `object-fit: cover` does the
 * cropping at render time. Pre-cropping is preferable when the displayed
 * frame has a fixed aspect — gives precise control over the focal point and
 * avoids object-fit edge-case differences between video and img elements.
 *
 *  - coupon-bg: legacy from the (retired) coupon banner; still referenced
 *    by some commits in /public/. Source kept around so re-encodes are
 *    deterministic if anyone needs them.
 *  - cocktails-bg: Phase 2C desktop Cocktails section frame. Source AIV01579
 *    (copper-shaker pour) is portrait at 0.667 aspect; pre-cropped to 9:16
 *    so the displayed frame matches Tap Wall's video frame edge-for-edge
 *    instead of showing render-time crop bars. `attention` focuses on the
 *    shaker pour rather than dark surrounding bar.
 */
const SOURCES = [
  { src: "Bar - liquor wall.jpg", name: "coupon-bg" },
  // Cocktails: source is 1067×1600 (0.667 portrait). 9:16 cover-crop max
  // dimension is 900×1600 (cropping width down). Widths [540, 900] cover
  // 1x display at ~450-wide frame and 2x retina at ~450-wide. Going beyond
  // 900 would either upscale (quality loss) or fall back to source-as-is
  // (defeats the crop). 1080/1280 widths used by other sources don't apply.
  // Asset: AIV01592 (cherry-garnished old fashioned with bokeh). Swapped
  // from AIV01579 (copper-shaker pour) during 2C polish — bokeh + glass
  // give the frame horizontal subject mass that matches Tap Wall's
  // beerwall-poster visual weight more than the shaker shot did.
  { src: "AIV01592.jpg", name: "cocktails-bg", aspect: [9, 16], widths: [540, 900] },
  // EBG row placeholders (Phase 2E sample): 4:3 cover-cropped cards for
  // the Eat · Bowl · Game 3-column row. All three are flagged as
  // PLACEHOLDERS — social team is producing brand-final stills which
  // will swap in via the same SOURCES config (one-line per asset).
  //   - ebg-eat: DSC05483 — visual-direction.md-listed food tray shot
  //   - ebg-bowl: AIV07036 — traditional-lanes wide shot, flagged in
  //     visual-direction.md as "supporting tile, not hero" (which is
  //     exactly the EBG card context)
  //   - ebg-game: Arcade - Prizes — brand-safe arcade choice (the
  //     full-neon ArcadeHeyFlow shot is explicitly off-brand for the
  //     homepage per visual-direction.md)
  // Widths [540, 832] cover 1x at ~416-wide cards and 2x retina close
  // to that. attention-based crop focuses on the focal subject.
  // Social-proof IG grid placeholders. Six brand-safe stills cropped
  // 1:1 for the IG-style thumbnails in the pre-footer "Don't take our
  // word for it" snap. PLACEHOLDERS — eventually swap to a live IG
  // embed (oEmbed or Basic Display API), defer to API batch round.
  // attention-based crop focuses on the focal subject of each source.
  { src: "AIV01592.jpg",                            name: "ig-1", aspect: [1, 1], widths: [320, 540] },
  { src: "DSC05483.jpg",                            name: "ig-2", aspect: [1, 1], widths: [320, 540] },
  { src: "AIV07036-Enhanced-NR.jpg",                name: "ig-3", aspect: [1, 1], widths: [320, 540] },
  { src: "Arcade - Prizes.jpg",                     name: "ig-4", aspect: [1, 1], widths: [320, 540] },
  { src: "events-catering/DSC00785-Enhanced-NR.jpg",name: "ig-5", aspect: [1, 1], widths: [320, 540] },
  { src: "AIV01579.jpg",                            name: "ig-6", aspect: [1, 1], widths: [320, 540] },

  // Stage carousel placeholders (Phase 2 architecture pivot — desktop
  // moves from stacked sections to a horizontal Glide.js carousel).
  // All cards use the same 9:16 frame aspect so the carousel reads as a
  // single repeating composition rather than a mix of sizes. Same source
  // candidates as the prior EBG row, just re-cropped to 9:16:
  //   - stage-eat: DSC05483 — food tray (1.5 landscape source)
  //   - stage-bowl: AIV07036 — traditional lanes (1.5 landscape source)
  //   - stage-game: Arcade - Prizes (0.67 portrait source — already
  //     close to 9:16, gentle horizontal trim)
  // The Game source is portrait, so 9:16 max from 1066×1600 = 900×1600.
  // Eat/Bowl sources are landscape; 9:16 max from 1600×1067 = 600×1067.
  // Widths chosen to match the per-source max without enlargement.
  { src: "DSC05483.jpg",            name: "stage-eat",  aspect: [9, 16], widths: [540, 600] },
  { src: "AIV07036-Enhanced-NR.jpg",name: "stage-bowl", aspect: [9, 16], widths: [540, 600] },
  { src: "Arcade - Prizes.jpg",     name: "stage-game", aspect: [9, 16], widths: [540, 900] },

  // Events: VIP-suite photo, source 1600×1067 (1.5 landscape). Now
  // displayed in a 9:16 contained frame (matching Tap Wall + Cocktails
  // cluster pattern) — the original full-bleed treatment was retired
  // when Events moved to position 2 with the same split-cluster register.
  // 9:16 cover-crop max dimension is 600×1067 from this source (cropping
  // width down to keep the height). Widths [540, 600] cover 1x at the
  // ~450-wide frame and 2x retina close to that; going beyond 600 would
  // require source enlargement. Placeholder until the events team
  // produces a portrait-friendly hero video — at that point the frame
  // swaps from <picture> to <video data-section-video> + lazy-source
  // pattern (matches Tap Wall).
  { src: "events-catering/DSC00785-Enhanced-NR.jpg", name: "events-bg", aspect: [9, 16], widths: [540, 600] },
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function encodeOne({ src, name, aspect, widths = WIDTHS }) {
  const srcPath = path.join(PICS, src);
  if (!(await exists(srcPath))) {
    console.warn(`SKIP  ${name}: source missing at ${srcPath}`);
    return;
  }

  const srcStat = await stat(srcPath);
  const meta = await sharp(srcPath).metadata();
  const aspectLabel = aspect ? ` [crop ${aspect[0]}:${aspect[1]}]` : "";
  console.log(
    `source: ${src}  ${meta.width}×${meta.height}  ` +
    `${(srcStat.size / 1024).toFixed(1)} KB  (${meta.format})  → ${name}-*${aspectLabel}`,
  );

  for (const w of widths) {
    const webpOut = path.join(OUT, `${name}-${w}.webp`);
    const jpgOut  = path.join(OUT, `${name}-${w}.jpg`);

    // If `aspect` is specified, force a fit:'cover' crop to that ratio
    // with smart focal-point positioning. Without aspect, preserve native.
    const resizeOpts = aspect
      ? {
          width: w,
          height: Math.round((w * aspect[1]) / aspect[0]),
          fit: "cover",
          position: "attention",
          withoutEnlargement: true,
        }
      : { width: w, withoutEnlargement: true };

    await sharp(srcPath)
      .resize(resizeOpts)
      .webp({ quality: 72, effort: 5 })
      .toFile(webpOut);

    await sharp(srcPath)
      .resize(resizeOpts)
      .jpeg({ quality: 76, progressive: true, mozjpeg: true })
      .toFile(jpgOut);

    const [wStat, jStat] = await Promise.all([stat(webpOut), stat(jpgOut)]);
    const outMeta = await sharp(webpOut).metadata();
    console.log(
      `  ${w}px  ${outMeta.width}×${outMeta.height}  ` +
      `webp ${(wStat.size / 1024).toFixed(1)} KB  ` +
      `jpg ${(jStat.size / 1024).toFixed(1)} KB`,
    );
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const entry of SOURCES) await encodeOne(entry);
}

main().catch((e) => { console.error(e); process.exit(1); });
