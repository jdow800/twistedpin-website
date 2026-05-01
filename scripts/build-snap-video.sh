#!/usr/bin/env bash
# ============================================================
# Twisted Pin — /snap-test/ beer-wall video pipeline
#
# Source: Context/videos/Beer Wall.mov   (2160×3840, 60fps, 7.6s, ~108 MB)
# Output: public/snap/
#   beerwall-poster.{webp,jpg}                    — first-frame poster
#   beerwall-mobile-{av1,h264}-1080.mp4           — mobile, 9:16, recut 0–5s
#
# Mobile-only video (snap section 3). Lazy-loaded via IntersectionObserver
# in the page; this pipeline just produces small variants. Audio stripped.
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
SRC="$ROOT/Context/videos/Beer Wall.mov"
OUT_DIR="$ROOT/public/snap"
mkdir -p "$OUT_DIR"

[[ -f "$SRC" ]] || { echo "missing: $SRC" >&2; exit 1; }

AV1_ENC="libaom-av1"
H264_ENC="libx264"

# Trim window: 0s → 5s. The first 5 seconds show the full tap wall.
TRIM_START="0"
TRIM_DUR="5"

# ---------- POSTER (first frame, 1080 wide) ----------
POSTER_PNG="$OUT_DIR/_beerwall-poster.png"
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" \
  -vframes 1 \
  -vf "scale=1080:-2:flags=lanczos" \
  "$POSTER_PNG"

# WebP + JPEG poster
ffmpeg -y -hide_banner -loglevel error -i "$POSTER_PNG" -q:v 78 "$OUT_DIR/beerwall-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$POSTER_PNG" -q:v 4  "$OUT_DIR/beerwall-poster.jpg"
rm -f "$POSTER_PNG"

# ---------- MOBILE 9:16 — AV1 ----------
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" -t "$TRIM_DUR" \
  -an \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v "$AV1_ENC" -b:v 0 -crf 36 -cpu-used 6 -row-mt 1 -tile-columns 2 -tile-rows 1 \
  -movflags +faststart \
  "$OUT_DIR/beerwall-mobile-av1-1080.mp4"

# ---------- MOBILE 9:16 — H.264 fallback ----------
ffmpeg -y -hide_banner -loglevel error \
  -ss "$TRIM_START" -i "$SRC" -t "$TRIM_DUR" \
  -an \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v "$H264_ENC" -profile:v high -level 4.0 -preset slow -crf 28 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUT_DIR/beerwall-mobile-h264-1080.mp4"

echo
echo "snap video outputs:"
ls -lh "$OUT_DIR" | awk '{ print "  " $5 "  " $9 }' | grep -E 'beerwall' || true
