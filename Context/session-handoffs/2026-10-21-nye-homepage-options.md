# NYE homepage invitation options — local design review

## State

Design review only, based on Website `origin/main` `72509dc`. No homepage activation, production deployment, push, booking/API/payment action or campaign scheduling change.

Worktree: `C:/Users/jdow8/dev/tprs/.claude/worktrees/nye-homepage-options-20261021`

Branch: `codex/nye-homepage-options-20261021`

Local review: `http://127.0.0.1:55616/nye-homepage-concepts/`

The SSR review route explicitly returns 404 outside Astro DEV. Root must integrate an approved server-protected review route before sharing remotely. `noindex` is also present but is not treated as authentication. Do not remove the DEV guard without that integration.

## Three treatments

1. **Mirrorball:** one 1.7-second drop and glint, then a compact invitation. “NYE. DONE RIGHT.” This is the strongest clear seasonal signal and the recommended starting point.
2. **Hello, 2027:** the year turns into view once, then settles. “HELLO, 2027.” More typographic and restrained; less immediately specific about NYE until the link is read.
3. **A little sparkle:** one small burst, then a translucent invitation. “MAKE DEC 31 A PLAN.” Quietest, with the least visual weight over the video.

All show “DECEMBER 31” and “See NYE parties →”, leading to `/new-years-eve/`. They make no scarcity, price, availability, midnight-toast or all-day admission claim.

The invitation is below the logo/menu and above the homepage headline. Settled cards are at most 150px high across the checked widths. The ordinary Reserve a lane / Plan an event actions retain their destinations. The desktop frame uses simplified navigation for placement review; this is not an exact production homepage clone.

## Scope and behavior

- Actual existing homepage mobile/desktop videos and posters; AV1 chosen when supported, H264 fallback. No new raster asset.
- Three option controls, replay, pause/resume, dismissal and phone/desktop comparison.
- One entrance on first visibility, not a continuous animation. Returning to the frame resumes video without replaying the entrance.
- Pause applies to both entrance and video. Explicit replay resumes motion unless reduced motion is active.
- System reduced motion and the review toggle use static invitation/poster. No-JS retains a static usable invitation.
- Dismissal hides the invitation and restores focus to the review Replay button; it does not cover or change the ordinary booking controls.
- Working homepage campaign lead is **December 7, after Jingle Bowl through December 6 in Chicago**. This remains a design assumption for later shared campaign policy. NYE sales opening stays **November 18 at 9am Central**. No scheduling code is changed here.
- No edits to Jingle components, shared auth/middleware/Base, homepage, seasonal configuration, booking or API code.

## Review and reproduction

```powershell
$env:ASTRO_TELEMETRY_DISABLED='1'
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run dev -- --host 127.0.0.1 --port 55616
# In another terminal:
node scripts/check-nye-homepage-options.mjs
```

The focused check drives only localhost and blocks external browser requests. It checks all three treatments at 320/390/430px and a 1440px desktop review, no overflow or overlap with nav/headline/booking, compact invitation height, valid unchanged destinations, dismiss/replay/focus, menu/Escape, actual video playback, pause/resume, reduced motion and no-JS fallback. It never enters checkout.

Regenerable screenshots and `results.json` are in ignored `.astro/nye-homepage-options/`: `disco-390.png`, `midnight-390.png`, `spark-390.png` and matching 320/430/1440 captures. Editable source and the reproduction script are the durable artifact. Captures were visually inspected at 390, narrow 320 and desktop 1440. No page-speed benchmark was run; Jon deferred that work.

## Protected review proposal

Prefer importing `HomepageEntranceOptions.astro` into a separately approved protected NYE review route. Root coordinates the existing gate owner before any shared auth, route list or sitemap change. Do not modify the concurrent Jingle concept page or its component. The local-only page can remain as a development harness. No activation should follow automatically from selecting a design.
