# NYE pre-opening visual proposals

Jon found the bright "See party times & prices" button misleading before sales
open. These are local visual proposals on top of Website a6d7241. No application
source, live page or opening date is changed by the renderer.

Both remove bright booking-like actions, emphasize "Reservations aren't open
yet", explicitly label the countdown and reinforce November 18 at 9am Central
in the header, bottom notice and closing section. Both remove room-card prices.

- `closed`: no schedule or prices until opening, as Jon suggested.
- `preview`: a quiet text link reveals a collapsed schedule for advance planning.
  This is the primary agent's recommendation; the independent reviewer favors
  `closed` to maximize pre-opening clarity. Neither is a conversion finding.

The existing mobile video is retained and separately verified playing at
390px with normal motion enabled (540x960, 8.93 seconds). Desktop is intentionally
a wide photo in the deployed version. That was a composition choice, not a
page-speed measurement. No new desktop-video treatment is implemented here.

With the isolated Astro preview running on port 55610:

```powershell
node Context/reviews/2026-10-21-nye-preopening/render.mjs
```

The renderer blocks external requests and never enters checkout. Source is
retained here; regenerable PNGs are under ignored `.astro/nye-preopening-review/`.
Reduced motion freezes the video for stable screenshots. The proposals use
temporary DOM overrides, not production-ready opening-transition code. Before
shipping either, integrate its state behavior with the existing opening client
and verify exact opening/end transitions and no-JavaScript fallback.
