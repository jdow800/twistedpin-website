#!/usr/bin/env bash
# ============================================================
# Twisted Pin — hero video pipeline
#
# Source:  Context/videos/Best Things To Order.mov
# Output:  public/hero/hero-{poster.{webp,jpg}, mobile-{av1,h264}-{1080,540}.mp4}
#
# Recut: frames 0–4s, with first frame held an extra ~0.4s (per locked treatment).
# Strips audio. AV1 + H.264 fallback at 1080×1920 and 540×960.
#
# Performance budget per the build brief:
#   - target mobile LCP <2.5s on simulated 4G
#   - the *poster* is the LCP element, not the video
#   - aim each video file under 2MB; drop resolution before sacrificing CRF
# ============================================================
set -euo pipefail

# winget installs ffmpeg outside PATH for git-bash sessions; resolve explicitly.
FFMPEG_DIR="/c/Users/jdow8/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin"
if [[ -d "$FFMPEG_DIR" ]]; then
  export PATH="$FFMPEG_DIR:$PATH"
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not on PATH — install via 'winget install Gyan.FFmpeg' and retry." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_PRIMARY="$ROOT/Context/videos/Best Things To Order.mov"
SRC_FALLBACK="$ROOT/mockups/assets/hero-mobile-clip.mp4"
OUT_DIR="$ROOT/public/hero"
mkdir -p "$OUT_DIR"

if [[ -f "$SRC_PRIMARY" ]]; then
  SRC="$SRC_PRIMARY"
elif [[ -f "$SRC_FALLBACK" ]]; then
  SRC="$SRC_FALLBACK"
  echo "info: using already-trimmed fallback ($SRC_FALLBACK)" >&2
else
  echo "error: no source video found." >&2
  exit 1
fi

# ----- pick AV1 encoder: prefer svtav1 if compiled in (≈10× faster than libaom)
AV1_ENC="libaom-av1"
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libsvtav1; then
  AV1_ENC="libsvtav1"
fi
echo "info: AV1 encoder = $AV1_ENC" >&2

# ============================================================
# 1. Poster — frame 0 → WebP + JPEG (max 1080w)
# ============================================================
echo "==> extracting poster frame…"
TMP_POSTER="$OUT_DIR/.tmp-poster.png"
ffmpeg -y -hide_banner -loglevel error \
  -ss 0 -i "$SRC" -frames:v 1 \
  -vf "scale='min(1080,iw)':-2:flags=lanczos" \
  "$TMP_POSTER"

# WebP — quality 80, lossy
ffmpeg -y -hide_banner -loglevel error \
  -i "$TMP_POSTER" \
  -c:v libwebp -quality 80 -compression_level 6 \
  "$OUT_DIR/hero-poster.webp"

# JPEG fallback — quality 82
ffmpeg -y -hide_banner -loglevel error \
  -i "$TMP_POSTER" \
  -q:v 4 \
  "$OUT_DIR/hero-poster.jpg"

rm -f "$TMP_POSTER"

# ============================================================
# 2. Recut + first-frame hold filter
#    - if source is the primary 98s .mov: trim 0–4s first
#    - if source is the already-trimmed 4s clip: skip trim
#    - tpad clones first frame for an extra ~0.4s
# ============================================================
COMMON_TRIM=()
if [[ "$SRC" == "$SRC_PRIMARY" ]]; then
  COMMON_TRIM=(-ss 0 -t 4)
fi

# At source 60fps, 0.4s ≈ 24 frames duplicated at the head.
VFILTER="tpad=start_mode=clone:start_duration=0.4"

# ============================================================
# 3. Encode variants
# ============================================================
encode_h264 () {
  local W="$1" H="$2" OUT="$3"
  echo "==> H.264 ${W}x${H} → $(basename "$OUT")"
  ffmpeg -y -hide_banner -loglevel error \
    "${COMMON_TRIM[@]}" -i "$SRC" \
    -an \
    -vf "$VFILTER,scale=${W}:${H}:flags=lanczos" \
    -c:v libx264 -profile:v high -level 4.0 \
    -preset slow -crf 26 \
    -pix_fmt yuv420p \
    -movflags +faststart \
    "$OUT"
}

encode_av1 () {
  local W="$1" H="$2" OUT="$3"
  echo "==> AV1 ($AV1_ENC) ${W}x${H} → $(basename "$OUT")"
  if [[ "$AV1_ENC" == "libsvtav1" ]]; then
    ffmpeg -y -hide_banner -loglevel error \
      "${COMMON_TRIM[@]}" -i "$SRC" \
      -an \
      -vf "$VFILTER,scale=${W}:${H}:flags=lanczos" \
      -c:v libsvtav1 -preset 6 -crf 32 \
      -pix_fmt yuv420p \
      -movflags +faststart \
      "$OUT"
  else
    ffmpeg -y -hide_banner -loglevel error \
      "${COMMON_TRIM[@]}" -i "$SRC" \
      -an \
      -vf "$VFILTER,scale=${W}:${H}:flags=lanczos" \
      -c:v libaom-av1 -cpu-used 4 -crf 32 -b:v 0 \
      -row-mt 1 -tile-columns 1 \
      -pix_fmt yuv420p \
      -movflags +faststart \
      "$OUT"
  fi
}

encode_h264 1080 1920 "$OUT_DIR/hero-mobile-h264-1080.mp4"
encode_h264  540  960 "$OUT_DIR/hero-mobile-h264-540.mp4"
encode_av1  1080 1920 "$OUT_DIR/hero-mobile-av1-1080.mp4"
encode_av1   540  960 "$OUT_DIR/hero-mobile-av1-540.mp4"

# ============================================================
# 4. Report
# ============================================================
echo ""
echo "==> output sizes:"
( cd "$OUT_DIR" && ls -lh hero-poster.* hero-mobile-*.mp4 | awk '{ printf "  %6s  %s\n", $5, $NF }' )

echo ""
echo "==> done. Outputs in $OUT_DIR"
