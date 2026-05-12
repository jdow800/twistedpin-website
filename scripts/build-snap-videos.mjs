/**
 * Twisted Pin — generic snap-section video pipeline.
 *
 * Encodes each entry in SOURCES to:
 *   public/snap/<name>-mobile-{av1,h264}-1080.mp4
 *   public/snap/<name>-mobile-{av1,h264}-540.mp4
 *   public/snap/<name>-poster.{webp,jpg}
 *
 * Mirrors the per-video bash scripts (build-snap-video.sh, build-nye-
 * video.sh, build-buffet-video.sh) but config-driven so additional
 * videos are one line in the SOURCES table — no new shell file.
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
 *   src       — filename relative to Context/videos/
 *   name      — output slug (used for /snap/<name>-mobile-* and <name>-poster.*)
 *   trimStart — seconds (default 0)
 *   trimDur   — seconds. Cap loops at 5–7s for in-frame editorial readability;
 *               longer is fine for full-bleed mobile-hero treatments.
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
];

const WIDTHS = [
  { w: 540,  h: 960 },
  { w: 1080, h: 1920 },
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

async function encodeOne({ src, name, trimStart = 0, trimDur }) {
  const srcPath = path.join(VIDS, src);
  if (!(await exists(srcPath))) {
    console.warn(`SKIP  ${name}: source missing at ${srcPath}`);
    return;
  }

  console.log(`source: ${src}  →  ${name}-mobile-*  (trim ${trimStart}s + ${trimDur}s)`);

  // ---- POSTER (first frame of trim window) ----
  const posterPng = path.join(OUT, `_${name}-poster.png`);
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", String(trimStart), "-i", srcPath,
    "-vframes", "1",
    "-vf", "scale=1080:-2:flags=lanczos",
    posterPng,
  ]);
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", posterPng, "-q:v", "78", path.join(OUT, `${name}-poster.webp`)]);
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", posterPng, "-q:v", "4",  path.join(OUT, `${name}-poster.jpg`)]);
  await unlink(posterPng).catch(() => {});

  // ---- MP4 variants ----
  for (const { w, h } of WIDTHS) {
    const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;

    // AV1
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(trimStart), "-i", srcPath, "-t", String(trimDur),
      "-an",
      "-vf", vf,
      "-c:v", "libaom-av1", "-b:v", "0", "-crf", "36",
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
      "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p",
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
  for (const entry of SOURCES) await encodeOne(entry);
}

main().catch((e) => { console.error(e); process.exit(1); });
