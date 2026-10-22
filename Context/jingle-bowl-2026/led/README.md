# Jingle Bowl LED artwork

2026-10-22: Jon requested an LED-wall graphic with a QR link directly to Jingle booking. This folder keeps the editable renderer, QR and finished exports together. The existing approved Santa artwork is reused without changing it. No controller, playback software, live screen, or booking data is changed by this work.

## Main delivery: 1920 × 1080

Jon confirmed his wife's usual canvas is **1920 × 1080** and welcomed animation. The main deliverables are therefore:

- **`Jingle-Bowl-LED-1920x1080.mp4`** — a 20-second, silent H.264 loop at 30fps, yuv420p, with fast-start metadata. Santa runs in, settles with a small bounce, then fades out for a clean loop. All copy and the QR stay still and visible throughout.
- **`Jingle-Bowl-LED-1920x1080.png`** — matching static backup.
- **`START-HERE-LED.txt`** — short delivery/use notes.

`animation-frame-preview.png` shows six actual frames of the encoded MP4. `animation-verification.json` records the source/export hashes and **50 successful QR decoding checks across the PNG plus 24 extracted MP4 frames at full and half size**. The MP4 is 1920 × 1080, 20 seconds, 30fps and has no audio track. The code is 540px square (12 pixels per module with four white quiet-zone modules), stationary for the full loop.

The direct user requirements preserved in `C:/Users/jdow8/dev/twisted-pin-notes/brand-design-kit/STATUS.md` also specify 1920 × 1080, roughly 50–60ft viewing distance, fewer words/larger type and light-gray preference. This does **not** use the rejected generated guide or its design package. The title is 210px, date 79px, inclusion headline 70px, and supporting details 45px. Copy is light gray against deep green; the QR alone uses black on white for contrast. All event facts and the Santa cutout come from the approved current Jingle page/assets.

## Optional native sizes and specification sources

The LED project is `C:/Users/jdow8/dev/Twisted Pin LED Wall/LED Wall Starting Discussion Points/`:

- `docs/ACTION-LIST.md`, status 2026-10-07: the promo mini-PC feed is 1280 × 720 at 60Hz.
- `findings/2026-09-16-controller-config-observed.md`, sections 1–3: active wall surfaces are 5908 × 448 Traditional and 2210 × 448 VIP; media zones are 420px high, leaving a 28px lane-tag band. Traditional zones are 1023, 1023, 1023, 1023, 1022 and 789px wide; VIP zones are three 736px sections. The historical 2284px VIP background size is not the observed active VIP canvas.
- The HDMI feed is stretched differently in different zones, so a normal 1280 × 720 QR image is not the recommended native wall artwork. Exact-dimension native exports keep the QR square.

## Optional files

The earlier native-canvas exports are kept in `optional-native/`, separate from the main 1920 × 1080 delivery. They are alternatives only if the existing playback setup requires an exact native BMS canvas; they are not a direction to change the wife's normal 1920 × 1080 workflow.

**Full-width wall artwork (only for native screen-media imports):**

- `Jingle-QR-5908x448-TRADITIONAL-WALL.png` — exact Traditional screen, repeating the message/QR in all six recorded zones.
- `Jingle-QR-2210x448-VIP-WALL.png` — exact observed VIP screen, repeating it in all three recorded zones.

Each full-width file keeps the bottom 28px black for the existing lane-tag band. Render/import at native dimensions without crop or stretch. The 74px physical/logical gap between the two screens is outside both files. These are two separate screen canvases, not one stretched graphic.

**For one native media zone:** `Jingle-QR-1023x420-ZONE.png` and `Jingle-QR-736x420-ZONE.png`. The 1022px and 789px final Traditional zones are generated internally into the full-screen file; do not stretch the 1023px file into those zones.

**Older 720p composition:** `Jingle-QR-1280x720-STANDARD-SCREEN.png`. The new main deliverable is 1920 × 1080. The recorded 720p HDMI feed stretches differently by zone. The decoder accepted simulated 720p-to-zone transforms, but that is not evidence of physical phone performance on the wall.

The two standalone `jingle-booking-qr` files (SVG and 900px PNG) are reusable QR assets, not full advertisements.

## Playback

Use the existing 1920 × 1080 video/image workflow; this task does not change controller dimensions, video input settings, lane tags or BMS presets. No upload/playback test was performed, and the import workflow has not been verified on the controller. Loop the full 20-second MP4, or keep the static graphic on screen at least 20 seconds. Before regular rotation, scan with a phone from the actual guest viewing area and confirm the booking page opens. Avoid crop, transitions or overlays over the QR.

The QR opens exactly `https://www.twistedpin.com/jingle-bowl/booking/`, without a lane hint or tracking redirect. It does not encode a password. The public launch/readiness is owned by the main release task. A printed fallback URL on the standard-screen version leads to the event landing page.

## Reproduce

From the Website repository root, with its existing Sharp, Playwright and font dependencies installed:

```powershell
npm.cmd ci --prefix Context/jingle-bowl-2026/led --ignore-scripts --no-audit --no-fund
node Context/jingle-bowl-2026/led/render.mjs
node Context/jingle-bowl-2026/led/animate.mjs --ffmpeg "<path to local ffmpeg executable>"
```

The renderers use headless local Edge, block all HTTP(S) requests, embed local assets/fonts and export PNGs. `animate.mjs` then uses local ffmpeg to animate the Santa layer, encode the video, extract actual encoded frames and verify their QR. It never opens the live website. `working/` contains reproducible HTML, intermediate zones, frame PNGs and logs, and is ignored. The finished MP4/PNGs, QR SVG/PNG, renderers, small pinned dependency manifests and verification JSONs should be tracked. The approved source cutout, logo and fonts remain in their existing repository paths; their hashes are recorded. The original offline ffmpeg executable used was the archived controller copy under `Twisted Pin LED Wall/Controller-2026-09-17-merged/Contenu_Bowling_Media_Studio/Bowling Media Studio V4/Outils/ffmpegSoft/ffmpeg.exe` (N-116752, libx264 available). No new system installation or live controller execution was involved.

## Verification

`optional-native/verification.json` pins the native renderer and source asset hashes plus each export hash. Final native run: **37 decoding checks passed**, including native and 50%-size zone renders, every zone in both full-wall exports at native and 50% size, and four diagnostic nonuniform 720p-to-zone transforms. All decoded to the exact booking URL. QR is error correction Q, 37 symbol modules plus a four-module white quiet zone on every side; native zone modules are six pixels Traditional and five pixels VIP. Zero outbound HTTP(S) requests occurred in either renderer. All main and optional layouts and the encoded animation frames were visually inspected for clipping, clear QR borders and wording.

This is offline image validation. No physical LED playback or phone scan is claimed. Nothing was posted, uploaded, sent or deployed by this artwork task.
