#!/usr/bin/env bash
# ============================================================
# Twisted Pin — /new-years-eve/ NYE video pipeline
#
# Source: Context/videos/NYE.mp4  (1080×1920, 30fps, ~9s, ~3.6 MB)
# Output: public/snap/
#   nye-poster.{webp,jpg}                 — first-frame poster
#   nye-mobile-{av1,h264}-1080.mp4        — 1080×1920 mobile
#   nye-mobile-{av1,h264}-540.mp4         — 540×960 narrow phones
#
# Same pattern as build-snap-video.sh (beer-wall pipeline). Audio
# stripped — hero plays muted-autoplay-loop. Source is already the
# right aspect (9:16) so the desktop split layout reuses the 1080
# variant directly inside a vertical frame; no separate desktop crop.
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
SRC="/c/Users/jdow8/OneDrive/Desktop/Claude/Website/Context/videos/NYE.mp4"
OUT_DIR="$ROOT/public/snap"
mkdir -p "$OUT_DIR"

[[ -f "$SRC" ]] || { echo "missing: $SRC" >&2; exit 1; }

AV1_ENC="libaom-av1"
H264_ENC="libx264"

# Use the full ~9s source. If it ends up not looping cleanly on the
# page, re-trim to a shorter window with `-t 6` here.

# ---------- POSTER (first frame, 1080 wide) ----------
POSTER_PNG="$OUT_DIR/_nye-poster.png"
ffmpeg -y -hide_banner -loglevel error \
  -i "$SRC" \
  -vframes 1 \
  -vf "scale=1080:-2:flags=lanczos" \
  "$POSTER_PNG"

ffmpeg -y -hide_banner -loglevel error -i "$POSTER_PNG" -q:v 78 "$OUT_DIR/nye-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$POSTER_PNG" -q:v 4  "$OUT_DIR/nye-poster.jpg"
rm -f "$POSTER_PNG"

# ---------- MOBILE 9:16 1080w — AV1 ----------
ffmpeg -y -hide_banner -loglevel error \
  -i "$SRC" \
  -an \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v "$AV1_ENC" -b:v 0 -crf 36 -cpu-used 6 -row-mt 1 -tile-columns 2 -tile-rows 1 \
  -movflags +faststart \
  "$OUT_DIR/nye-mobile-av1-1080.mp4"

# ---------- MOBILE 9:16 1080w — H.264 fallback ----------
ffmpeg -y -hide_banner -loglevel error \
  -i "$SRC" \
  -an \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v "$H264_ENC" -profile:v high -level 4.0 -preset slow -crf 28 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUT_DIR/nye-mobile-h264-1080.mp4"

# ---------- MOBILE 9:16 540w — AV1 ----------
ffmpeg -y -hide_banner -loglevel error \
  -i "$SRC" \
  -an \
  -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960" \
  -c:v "$AV1_ENC" -b:v 0 -crf 36 -cpu-used 6 -row-mt 1 -tile-columns 2 -tile-rows 1 \
  -movflags +faststart \
  "$OUT_DIR/nye-mobile-av1-540.mp4"

# ---------- MOBILE 9:16 540w — H.264 fallback ----------
ffmpeg -y -hide_banner -loglevel error \
  -i "$SRC" \
  -an \
  -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960" \
  -c:v "$H264_ENC" -profile:v high -level 4.0 -preset slow -crf 28 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUT_DIR/nye-mobile-h264-540.mp4"

echo
echo "nye video outputs:"
ls -lh "$OUT_DIR" | awk '{ print "  " $5 "  " $9 }' | grep -E 'nye-' || true
