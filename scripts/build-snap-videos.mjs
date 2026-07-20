/**
 * Twisted Pin — generic snap-section video pipeline.
 *
 * Encodes each entry in SOURCES to:
 *   public/snap/<name>-mobile-{av1,h264}-1080.mp4
 *   public/snap/<name>-mobile-{av1,h264}-540.mp4
 *   public/snap/<name>-poster.{webp,jpg}
 *
 * Replaces the old per-video bash scripts — config-driven, so an additional
 * video is one line in the SOURCES table rather than a new shell file.
 * build-snap-video.sh (beerwall) and build-buffet-video.sh have been migrated
 * here and deleted; they'd have silently reverted their assets if re-run.
 * build-nye-video.sh still exists but is already broken (its SRC is a stale
 * absolute path from an old machine) — nye passes check-av1-sizes.mjs, so it
 * was left alone rather than migrated blind.
 *
 * Skip-on-missing-source pattern matches build-snap-images.mjs:
 * gitignored Context/videos/ isn't always populated on a fresh worktree.
 *
 * Run: `node scripts/build-snap-videos.mjs`
 *
 * Requires ffmpeg on PATH. On Windows the WinGet install location is
 * auto-detected.
 */
import { spawn } from "node:child_process";
import { mkdir, stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VIDS = path.join(ROOT, "Context", "videos");
const OUT  = path.join(ROOT, "public", "snap");

// Auto-detect Windows WinGet ffmpeg if not on PATH.
const FFMPEG_WIN_HINT = "C:\\Users\\jdow8\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin";
if (process.platform === "win32" && existsSync(FFMPEG_WIN_HINT)) {
  process.env.PATH = `${FFMPEG_WIN_HINT};${process.env.PATH ?? ""}`;
}

/**
 * Each entry produces 4 mp4s + 2 posters.
 *
 *   src        — filename relative to Context/videos/
 *   name       — output slug (used for /snap/<name>-mobile-* and <name>-poster.*)
 *   trimStart  — seconds (default 0)
 *   trimDur    — seconds. Cap loops at 5–7s for in-frame editorial readability;
 *                longer is fine for full-bleed mobile-hero treatments.
 *   crfAv1     — AV1 quality override (default 36). Raise for longer clips.
 *   crfH264    — H.264 quality override (default 28). Raise for longer clips.
 *   skipPoster — leave the existing <name>-poster.* files alone. Use when the
 *                poster is a deliberately-chosen image that shouldn't follow
 *                the video source (see the beerwall entry).
 */
const SOURCES = [
  // 720x1280 30fps 6s — full source, no trim needed.
  { src: "Cocktails Hero.mp4", name: "cocktails-hero", trimStart: 0, trimDur: 6 },

  // Arcade source swapped 2026-05-12: original Arcade.mp4 → "One More Time.mp4".
  // New source per user request after Round 2 testing. Output slug kept
  // as "arcade" so /snap/arcade-mobile-* references on the homepage Game
  // snap + /game hero stay valid without markup churn.
  { src: "One More Time.mp4", name: "arcade", trimStart: 0, trimDur: 6 },

  // 360x640 30fps 7.5s — phone-shot vertical, full duration. Source is
  // small (360w native); 540w + 1080w outputs upscale. Acceptable for
  // /careers editorial frame at max-width 360–420px.
  { src: "Hiring Vid.mp4", name: "hiring", trimStart: 0, trimDur: 7.5 },

  // 2160x3840 60fps 6.9s — 4K phone-shot vertical, food montage.
  // Replaces the eat-kitchen still on the homepage Eat snap (2026-05-12).
  { src: "Best Things To Order.mov", name: "best-things", trimStart: 0, trimDur: 6.5 },

  // 1080x1920 60fps 7.5s — Summer Pin Pass promo, vertical.
  // Replaces the vip-energy still on the homepage Bowl snap (2026-05-12).
  { src: "Summer Pass.mp4", name: "summer-pass", trimStart: 0, trimDur: 7 },

  // 1080x1920 30fps 8.7s — group-event/venue ambience clip, vertical.
  // Used on /events "Six lanes set apart" section (2026-05-12).
  { src: "Where you belong (no sound).mov", name: "where-you-belong", trimStart: 0, trimDur: 7 },

  // 3840x2160 24fps 7.4s — landscape lane shot with VIP signage + LED
  // walls. Center-cropped to portrait by the standard scale+crop in
  // this pipeline (full source height, centered horizontal slice — the
  // brand-relevant subjects happen to live in the centered third of
  // the wide frame). Used on /vip-suite "The Room" section (2026-05-12).
  { src: "Vip Lanes.mov", name: "vip-lanes", trimStart: 0, trimDur: 7 },

  // 1080x1920 60fps 10.5s — produced 6-shot tap-wall montage (BEER HELPS
  // signage → branded pin tap handles → pour → tap-list screens + glassware
  // → backbar). Replaces the single-shot 5s "Beer Wall.mov" clip and retires
  // the bespoke scripts/build-snap-video.sh (2026-07-20).
  //
  // Full 10.5s, no trim: each shot earns its place and a 5s cut would drop
  // half the montage. CRF is raised to pay for the extra duration — measured
  // at 1.9 MB h264-1080, which is BETTER bytes-per-second than the 5s clip it
  // replaces (0.18 vs 0.26 MB/s). Verified at 1:1 that the tap-list screen
  // text stays legible at crf 32; on the homepage it also sits behind a scrim.
  //
  // crfAv1 46 is NOT "36 + a bit" — AV1's CRF scale runs 0–63 against H.264's
  // 0–51, so the pipeline default of 36 is a much higher quality target than
  // h264's 28. Left at 38, AV1 encoded LARGER than its own H.264 fallback
  // (2071 vs 1899 KB) — and since AV1 is the first <source>, capable browsers
  // were being served the heavier file. At 46 AV1 lands 32% under H.264
  // (1298 KB) and still looks cleaner than it at 1:1. If you add another long
  // clip here, check that av1 < h264 rather than assuming it.
  //
  // 60fps retained deliberately: dropping to 30 saved only ~10% here (the
  // montage is spatially detailed, not motion-heavy) and would judder the
  // dolly moves. Not worth the trade.
  //
  // skipPoster: beerwall-poster.* stays as-is — the WIDE establishing shot of
  // the full 28-tap wall, from the retired source. It is shared by FOUR
  // surfaces (homepage snap 3, homepage desktop cluster, /bar video poster +
  // LCP preload, /menu/taps mobile hero + LCP preload), and no frame in this
  // montage frames the whole wall the way it does. Jon's call 2026-07-20:
  // swap the video, keep the poster. Regenerating it here would silently
  // change the /menu/taps hero photo as a side effect of a video edit.
  { src: "TWP_The_Tap_Wall_V1.mp4", name: "beerwall", trimStart: 0, trimDur: 10.5, crfAv1: 46, crfH264: 32, skipPoster: true },

  // Migrated from scripts/build-buffet-video.sh 2026-07-20 (settings were
  // identical to this pipeline's defaults, so this is a like-for-like move).
  // Brought in during the av1Bump pass because buffet-540 was the #2 offender
  // at +15%, and it couldn't be fixed while it lived in its own script.
  // skipPoster: buffet-poster.* is already shipped and tuned — this migration
  // is about the mp4s only.
  { src: "Buffet Before & After.mov", name: "buffet", trimStart: 6.3, trimDur: 7, skipPoster: true },
];

/**
 * av1Bump — added to the entry's crfAv1 at this width.
 *
 * AV1 needs a HIGHER crf (= lower quality target) at small frame sizes to stay
 * smaller than its own H.264 fallback. libaom's per-frame overhead doesn't
 * shrink proportionally with resolution, so one crf tuned at 1080 is far too
 * generous at 540. Measured 2026-07-20: at the shared default, AV1 encoded
 * LARGER than H.264 at 540 on 5 of 10 videos (arcade worst at +29%) while
 * winning at 1080 on all 10. Since AV1 is the first <source>, that meant
 * AV1-capable phones — the narrow ones, on the 540 variant — were downloading
 * the HEAVIER file. +9 puts arcade 20% under H.264 with no visible difference
 * against the H.264 those phones already receive.
 *
 * Invariant worth preserving: av1 < h264 at BOTH widths for every entry.
 * `node scripts/check-av1-sizes.mjs` verifies it.
 */
const WIDTHS = [
  { w: 540,  h: 960,  av1Bump: 9 },
  { w: 1080, h: 1920, av1Bump: 0 },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.split("\n").slice(-5).join("\n")}`));
    });
  });
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function encodeOne({ src, name, trimStart = 0, trimDur, crfAv1 = 36, crfH264 = 28, skipPoster = false }) {
  const srcPath = path.join(VIDS, src);
  if (!(await exists(srcPath))) {
    console.warn(`SKIP  ${name}: source missing at ${srcPath}`);
    return;
  }

  console.log(`source: ${src}  →  ${name}-mobile-*  (trim ${trimStart}s + ${trimDur}s)`);

  // ---- POSTER (first frame of trim window) ----
  if (skipPoster) {
    console.log(`  poster: kept existing ${name}-poster.* (skipPoster)`);
  } else {
    const posterPng = path.join(OUT, `_${name}-poster.png`);
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(trimStart), "-i", srcPath,
      "-vframes", "1",
      "-vf", "scale=1080:-2:flags=lanczos",
      posterPng,
    ]);

    // AVIF is what the markup actually references site-wide; webp/jpg are kept
    // for older-browser fallbacks. AVIF used to be produced only by a separate
    // manual sweep (scripts/reencode-posters.mjs, 2026-05-17), which meant
    // re-running THIS script left a stale .avif sitting next to a freshly
    // generated .webp — they could silently disagree. Emitted together here so
    // they can't diverge. Qualities match that sweep's settings.
    const png = sharp(posterPng);
    await Promise.all([
      png.clone().avif({ quality: 50, effort: 4 }).toFile(path.join(OUT, `${name}-poster.avif`)),
      png.clone().webp({ quality: 65, effort: 6 }).toFile(path.join(OUT, `${name}-poster.webp`)),
      png.clone().jpeg({ quality: 78, progressive: true, mozjpeg: true }).toFile(path.join(OUT, `${name}-poster.jpg`)),
    ]);
    const pStats = await Promise.all([
      stat(path.join(OUT, `${name}-poster.avif`)),
      stat(path.join(OUT, `${name}-poster.webp`)),
    ]);
    console.log(`  poster  avif ${(pStats[0].size / 1024).toFixed(1)} KB  webp ${(pStats[1].size / 1024).toFixed(1)} KB`);
    await unlink(posterPng).catch(() => {});
  }

  // ---- MP4 variants ----
  for (const { w, h, av1Bump = 0 } of WIDTHS) {
    const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    const av1CrfAtWidth = Math.min(63, crfAv1 + av1Bump); // 63 = libaom max

    // AV1
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(trimStart), "-i", srcPath, "-t", String(trimDur),
      "-an",
      "-vf", vf,
      "-c:v", "libaom-av1", "-b:v", "0", "-crf", String(av1CrfAtWidth),
      "-cpu-used", "6", "-row-mt", "1", "-tile-columns", "2", "-tile-rows", "1",
      "-movflags", "+faststart",
      path.join(OUT, `${name}-mobile-av1-${w}.mp4`),
    ]);

    // H.264
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(trimStart), "-i", srcPath, "-t", String(trimDur),
      "-an",
      "-vf", vf,
      "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
      "-preset", "slow", "-crf", String(crfH264), "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      path.join(OUT, `${name}-mobile-h264-${w}.mp4`),
    ]);

    const sizes = await Promise.all([
      stat(path.join(OUT, `${name}-mobile-av1-${w}.mp4`)),
      stat(path.join(OUT, `${name}-mobile-h264-${w}.mp4`)),
    ]);
    console.log(`  ${w}px  av1 ${(sizes[0].size / 1024).toFixed(1)} KB  h264 ${(sizes[1].size / 1024).toFixed(1)} KB`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // `--no-posters` regenerates ONLY the mp4s. Use it for any re-encode pass
  // over already-shipped videos.
  //
  // ⚠️ Posters have been hand-tuned AFTER this script generated them and this
  // script does NOT know about it. arcade-poster.avif is 720x1280, not 1080 —
  // deliberately downscaled (2026-05-17) because arcade content compresses
  // 3-5x worse than the others; that took it 209 KB -> 79 KB, and it is the
  // LCP element on /game. Regenerating posters here would silently restore it
  // to 1080 and undo the win. Same risk for any poster touched by
  // scripts/reencode-posters.mjs. Until per-entry posterWidth exists, a video
  // re-encode should pass --no-posters.
  const noPosters = process.argv.includes("--no-posters");

  // Optional name filter: `node scripts/build-snap-videos.mjs beerwall arcade`.
  // Without it every source re-encodes, which is slow and needlessly rewrites
  // assets that are already shipped and immutable-cached.
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const queue = only.length ? SOURCES.filter((s) => only.includes(s.name)) : SOURCES;

  if (only.length && queue.length !== only.length) {
    const known = SOURCES.map((s) => s.name);
    const missing = only.filter((n) => !known.includes(n));
    console.error(`unknown name(s): ${missing.join(", ")}\nknown: ${known.join(", ")}`);
    process.exit(1);
  }

  for (const entry of queue) {
    await encodeOne(noPosters ? { ...entry, skipPoster: true } : entry);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
