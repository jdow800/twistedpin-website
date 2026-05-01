#!/usr/bin/env bash
# ============================================================
# Twisted Pin — hero video pipeline
#
# Mobile source:   Context/videos/Bank Vs Stories.mp4   (1080×1920, 60fps)
# Desktop source:  Context/videos/After Social Highlight - Plainfield Lanes x Twisted Pin - Jon Dow - 15610 S Joliet RD Plainfield, IL_v2.mp4   (1920×1080, 30fps)
#
# Outputs: public/hero/
#   hero-poster.{webp,jpg}                        — mobile poster (frame 0 of mobile source)
#   hero-mobile-{av1,h264}-{1080,540}.mp4         — mobile, 9:16, recut 0–4s + 0.4s first-frame hold
#   hero-desktop-poster.{webp,jpg}                — desktop poster (frame 0 of desktop source)
#   hero-desktop-{av1,h264}.mp4                   — desktop, 16:9, recut 0–8s, 1920×1080
#
# Performance budget per the build brief:
#   - mobile  ≤ 2 MB per variant (poster is the LCP element)
#   - desktop ≈ 4 MB combined target — placeholder, aggressive CRF to fit
#   - audio always stripped
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
SRC_MOBILE="$ROOT/Context/videos/Bank Vs Stories.mp4"
SRC_DESKTOP="$ROOT/Context/videos/After Social Highlight - Plainfield Lanes x Twisted Pin - Jon Dow - 15610 S Joliet RD Plainfield, IL_v2.mp4"
OUT_DIR="$ROOT/public/hero"
mkdir -p "$OUT_DIR"

[[ -f "$SRC_MOBILE"  ]] || { echo "missing: $SRC_MOBILE"  >&2; exit 1; }
[[ -f "$SRC_DESKTOP" ]] || { echo "missing: $SRC_DESKTOP" >&2; exit 1; }

AV1_ENC="libaom-av1"
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libsvtav1; then
  AV1_ENC="libsvtav1"
fi
echo "info: AV1 encoder = $AV1_ENC" >&2

# ============================================================
# MOBILE
# ============================================================
echo "==> MOBILE: poster"
TMP="$OUT_DIR/.tmp-mobile-poster.png"
ffmpeg -y -hide_banner -loglevel error -ss 0 -i "$SRC_MOBILE" -frames:v 1 \
  -vf "scale='min(1080,iw)':-2:flags=lanczos" "$TMP"
ffmpeg -y -hide_banner -loglevel error -i "$TMP" -c:v libwebp -quality 80 -compression_level 6 "$OUT_DIR/hero-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$TMP" -q:v 4 "$OUT_DIR/hero-poster.jpg"
rm -f "$TMP"

MOBILE_TRIM=(-ss 0 -t 4)
MOBILE_VFILTER="tpad=start_mode=clone:start_duration=0.4"

mobile_h264() { local W=$1 H=$2 OUT=$3 CRF=$4
  echo "==> MOBILE H.264 ${W}x${H} CRF $CRF → $(basename "$OUT")"
  ffmpeg -y -hide_banner -loglevel error "${MOBILE_TRIM[@]}" -i "$SRC_MOBILE" -an \
    -vf "$MOBILE_VFILTER,scale=${W}:${H}:flags=lanczos" \
    -c:v libx264 -profile:v high -level 4.0 -preset slow -crf "$CRF" \
    -pix_fmt yuv420p -movflags +faststart "$OUT"
}
mobile_av1() { local W=$1 H=$2 OUT=$3 CRF=$4
  echo "==> MOBILE AV1 ${W}x${H} CRF $CRF → $(basename "$OUT")"
  if [[ "$AV1_ENC" == "libsvtav1" ]]; then
    ffmpeg -y -hide_banner -loglevel error "${MOBILE_TRIM[@]}" -i "$SRC_MOBILE" -an \
      -vf "$MOBILE_VFILTER,scale=${W}:${H}:flags=lanczos" \
      -c:v libsvtav1 -preset 6 -crf "$CRF" \
      -pix_fmt yuv420p -movflags +faststart "$OUT"
  else
    ffmpeg -y -hide_banner -loglevel error "${MOBILE_TRIM[@]}" -i "$SRC_MOBILE" -an \
      -vf "$MOBILE_VFILTER,scale=${W}:${H}:flags=lanczos" \
      -c:v libaom-av1 -cpu-used 4 -crf "$CRF" -b:v 0 \
      -row-mt 1 -tile-columns 1 -pix_fmt yuv420p -movflags +faststart "$OUT"
  fi
}

# Bank Vs Stories needs higher CRF than Best Things To Order at the same target size.
mobile_h264 1080 1920 "$OUT_DIR/hero-mobile-h264-1080.mp4" 28
mobile_h264  540  960 "$OUT_DIR/hero-mobile-h264-540.mp4"  28
mobile_av1  1080 1920 "$OUT_DIR/hero-mobile-av1-1080.mp4"  36
mobile_av1   540  960 "$OUT_DIR/hero-mobile-av1-540.mp4"   36

# ============================================================
# DESKTOP
# ============================================================
echo "==> DESKTOP: poster"
TMP="$OUT_DIR/.tmp-desktop-poster.png"
ffmpeg -y -hide_banner -loglevel error -ss 0 -i "$SRC_DESKTOP" -frames:v 1 \
  -vf "scale=1920:1080:flags=lanczos" "$TMP"
ffmpeg -y -hide_banner -loglevel error -i "$TMP" -c:v libwebp -quality 80 -compression_level 6 "$OUT_DIR/hero-desktop-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$TMP" -q:v 4 "$OUT_DIR/hero-desktop-poster.jpg"
rm -f "$TMP"

# Aggressive CRF on desktop because the brief caps combined ~4MB and the source is 8s @ 1080p.
echo "==> DESKTOP H.264 1920x1080 CRF 40"
ffmpeg -y -hide_banner -loglevel error -ss 0 -t 8 -i "$SRC_DESKTOP" -an \
  -vf "scale=1920:1080:flags=lanczos" \
  -c:v libx264 -profile:v high -level 4.2 -preset slow -crf 40 \
  -pix_fmt yuv420p -movflags +faststart "$OUT_DIR/hero-desktop-h264.mp4"

echo "==> DESKTOP AV1 1920x1080 CRF 50"
ffmpeg -y -hide_banner -loglevel error -ss 0 -t 8 -i "$SRC_DESKTOP" -an \
  -vf "scale=1920:1080:flags=lanczos" \
  -c:v libsvtav1 -preset 6 -crf 50 \
  -pix_fmt yuv420p -movflags +faststart "$OUT_DIR/hero-desktop-av1.mp4"

# ============================================================
# REPORT
# ============================================================
echo ""
echo "==> output sizes:"
( cd "$OUT_DIR" && ls -lh hero-poster.* hero-mobile-*.mp4 hero-desktop-poster.* hero-desktop-*.mp4 2>/dev/null \
  | awk '{ printf "  %6s  %s\n", $5, $NF }' )
echo ""
echo "==> done. Outputs in $OUT_DIR"
