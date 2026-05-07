#!/usr/bin/env bash
# ============================================================
# Twisted Pin — Buffet (events / vip-suite) video pipeline
#
# Source: Context/videos/Buffet Before & After.mov  (2160×3840, 60fps, ~13s)
# Output: public/snap/
#   buffet-poster.{webp,jpg}                — first-frame poster
#   buffet-mobile-{av1,h264}-1080.mp4       — 1080×1920 (1x mobile + desktop frame)
#   buffet-mobile-{av1,h264}-540.mp4        — 540×960 narrow phones
#
# Used in:
#   - Homepage desktop cluster "Events that don't suck" section
#   - /events "What You Can Host" section
#
# Source is already 9:16 portrait so no aspect crop needed. Audio
# stripped — videos play muted-autoplay-loop. Trim window 6.3-13.3
# (last 7s of the 13.3s source) per user 2026-05-07 — the "after" beat
# (full spread, room set up) is the most impactful for the homepage
# events tile and the /events editorial frame.
# ============================================================
set -euo pipefail

FFMPEG_DIR="/c/Users/jdow8/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin"
if [[ -d "$FFMPEG_DIR" ]]; then
  export PATH="$FFMPEG_DIR:$PATH"
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not on PATH — install via 'winget install Gyan.FFmpeg' and retry." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/Context/videos/Buffet Before & After.mov"
OUT_DIR="$ROOT/public/snap"
mkdir -p "$OUT_DIR"

[[ -f "$SRC" ]] || { echo "missing: $SRC" >&2; exit 1; }

AV1_ENC="libaom-av1"
H264_ENC="libx264"

# Trim window: 6.3s → 13.3s (last 7s of the source). The "after" beat
# is the most visually impactful — full spread, room set up, the payoff.
TRIM_START="6.3"
TRIM_DUR="7"

# ---------- POSTER (first frame, 1080 wide) ----------
POSTER_PNG="$OUT_DIR/_buffet-poster.png"
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" \
  -vframes 1 \
  -vf "scale=1080:-2:flags=lanczos" \
  "$POSTER_PNG"

ffmpeg -y -hide_banner -loglevel error -i "$POSTER_PNG" -q:v 78 "$OUT_DIR/buffet-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$POSTER_PNG" -q:v 4  "$OUT_DIR/buffet-poster.jpg"
rm -f "$POSTER_PNG"

# ---------- 9:16 1080w — AV1 ----------
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" -t "$TRIM_DUR" \
  -an \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v "$AV1_ENC" -b:v 0 -crf 36 -cpu-used 6 -row-mt 1 -tile-columns 2 -tile-rows 1 \
  -movflags +faststart \
  "$OUT_DIR/buffet-mobile-av1-1080.mp4"

# ---------- 9:16 1080w — H.264 fallback ----------
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" -t "$TRIM_DUR" \
  -an \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v "$H264_ENC" -profile:v high -level 4.0 -preset slow -crf 28 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUT_DIR/buffet-mobile-h264-1080.mp4"

# ---------- 9:16 540w — AV1 (narrow viewport) ----------
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" -t "$TRIM_DUR" \
  -an \
  -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960" \
  -c:v "$AV1_ENC" -b:v 0 -crf 36 -cpu-used 6 -row-mt 1 -tile-columns 2 -tile-rows 1 \
  -movflags +faststart \
  "$OUT_DIR/buffet-mobile-av1-540.mp4"

# ---------- 9:16 540w — H.264 fallback (narrow viewport) ----------
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" -t "$TRIM_DUR" \
  -an \
  -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960" \
  -c:v "$H264_ENC" -profile:v high -level 4.0 -preset slow -crf 28 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUT_DIR/buffet-mobile-h264-540.mp4"

echo
echo "buffet video outputs:"
ls -lh "$OUT_DIR" | awk '{ print "  " $5 "  " $9 }' | grep -E 'buffet' || true
