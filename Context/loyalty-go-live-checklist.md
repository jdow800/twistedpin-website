# Loyalty Platform — Go-Live Checklist

> ## 🟢 CUTOVER EXECUTED 2026-07-27 — PLATFORM IS LIVE
> Forms swapped, Patch automations off, Patch kiosk retired + Zite kiosk live, delta
> imported, **quarantine LIFTED → 18,349 marketable.** All guest paths verified with real
> signups + a test blast.
> **⚠️ Proactive marketing is DELIBERATELY PAUSED:** birthday + winbacks were re-disabled
> after the lift (Jon's call — "don't fire to real guests yet"). Only `kids-free-bowl-window`
> is on. **Re-enabling those 5 automations is the switch to go fully live.** Guest-initiated
> welcome texts + silent kids grants already fire (intended).
> **Remaining:** see the dated **Current to-do** section immediately below — it's the live
> source of truth. Kids window already restored to real 10:45–4:10, blackouts empty.

---

## Current to-do (as of 2026-07-27 evening — Jon picking back up in a few hours)

Everything under the cutover is verified: base marketable (18,349), points **earning confirmed
live** (kiosk check-in → +50, once/day, `America/Chicago`; proven by Shanna's real check-in),
STOP/START verified (7/19), quiet-hours guard shipped (below). Only `kids-free-bowl-window` is
enabled; all proactive marketing is still OFF by design.

**A. Go-live switch (the main thing)**
- [ ] **Enable the automations:** `birthday` + `winback-50-initial` + `winback-330-initial`
      (+ the two `*-reminder` variants). Runner (`loyalty-lifecycle-daily` pg_cron, 11am
      Central) is live, so flipping `enabled=true` works immediately. Metered, not a blast
      (~50/day birthday, ~58/week winback). **Stagger:** birthday first, watch a day, then
      the winbacks on a morning you can watch the first-Thursday wave.

**B. Patch teardown**
- [x] ~~Repoint the Frame social-wall free-game coupons off Patch~~ **RESOLVED BY REMOVAL
      2026-07-27** — Jon deleted the "send a free game to a friend" feature from Frame entirely
      (few redemptions; simpler than repointing). No coupons land in Patch anymore. Memory
      `frame-social-wall-coupons-to-loyalty` is now closed/obsolete.
- [~] **Cancel Patch — deliberately held ~1 week as a warm fallback (Jon, 2026-07-27).**
      Everything in Patch is turned OFF (automations + kiosk), but billing is NOT cancelled yet
      — kept as a read-only archive / rollback option while the new platform proves out.
      **Target cancel ~Aug 3; HARD DEADLINE Aug 15** (~$580/mo — miss it = another month billed).
      Only risk is forgetting → set a phone reminder for ~Aug 10 as "cancel by," Aug 15 = drop-dead.

**C. Shipped this session (done)**
- [x] **Marketing quiet-hours guard — migration `067_marketing_quiet_hours` LIVE.** BEFORE
      INSERT trigger on `scheduled_message` holds `cap_exempt=false` (marketing) sends outside
      **11am–6pm Central** to the next 11am; `cap_exempt=true` (welcomes/tests/overrides) sent
      immediately, any hour. DST-correct (verified CDT + CST). Caveat: any *new* transactional
      message type must set `cap_exempt=true` or it'll be held to morning.

**D. Open / your call (none blocking)**
- [ ] **`visit_count_lifetime` bump** in `earn_points_on_checkin()` — the earn trigger awards
      points but doesn't increment the lifetime visit counter (stays 0 for everyone). One-line
      add if you want it for tiering/frequency segments.
- [ ] **Program Health dashboard** — acceptance-check the numbers now that it landed.
- [ ] **Avery-consent flag** — re-check whether the "parked checkout cohort" blocker actually
      cleared; the 7/24 `avery_inbound` opt_in/opt_out events suggest Avery's number may now be
      recording consent (Phase 3 note may be stale).
- [ ] **STOP/START re-run** — optional; already covered by the 7/19 test.
- [ ] Zite asks pending: kiosk **nightly 4am auto-reload** + **manual refresh button**
      (prompts sent); blast composer **test-mode fix** (approved their plan + sent 2 corrections:
      "Sarah"→"Shanna", and a hard recipient-count gate on the live send).

**Kiosk earning note:** Jon's own record shows 0 points despite 18 check-ins today — that's a
test artifact (he wiped his number mid-day after an early check-in already earned; the once/day
dedup correctly won't re-award same day). Not a bug. Shanna: 2 check-ins today → 50 points.

**The running list.** Cutover target **Mon Jul 27 2026** (venue closed for training 27–29;
Mixology event evening of the 28th → do heavy lifting the 27th, keep the 29th as buffer;
doors reopen Thu Jul 30).

Background/detail lives in memory: `loyalty-patch-cutover-plan`, `loyalty-rebook-lever`,
`loyalty-phone-dedup-launch-blocker`, `loyalty-windowed-programs`.

---

## ⚠️ STATE YOU MUST KNOW BEFORE FLIPPING ANYTHING

- **32,713 customers are imported and QUARANTINED** (`do_not_market=true`, tag
  `import:quarantine`). 18,372 consented, 815k points, 3,228 kids-program members,
  18.7k birthdays. They are invisible to every automation until the lift.
- **EVERY lifecycle automation is currently DISABLED** except `kids-free-bowl-window`.
  Birthday and both winbacks were enabled earlier and have since been switched off.
  **They will not fire at go-live unless consciously re-enabled** — see Phase 2.
- Checkout-consented bookers are auto-parked (`parked:checkout-optin`) and are a
  *separate* release decision from the import quarantine. Do not lift them together.
- Jon + Shanna are the only live/unquarantined testers.

---

## Phase 0 — Before cutover day

- [x] ~~URL swaps branch (Website)~~ **BUILT + COMMITTED 2026-07-24 — branch
      `feat/loyalty-url-cutover`, commit `6e8cbd6`. NOT merged, NOT deployed.**
      Both preview pages promoted onto `/coupon` and `/free-kids-bowling` (iframes,
      preview banners, noindex, robots Disallow + sitemap exclusions all gone), `/free`
      repointed, preview routes deleted, `/rewards` BOWL123→85775 Text Club join replaced
      with a link to the native `/coupon` signup. Build-verified.
      **→ Cutover day step 1 is now literally `git merge feat/loyalty-url-cutover`.**
      **`/coupon` title resolved 2026-07-24** (Jon: "whatever is better SEO"):
      **"$10 Lane Credit in Plainfield, IL | Twisted Pin"** — 47 chars, keyword first,
      geo, brand last per seo.md's under-60 rule. The *old live* title led with
      "Free", which seo.md §Negative Keywords bans as a modifier on bowling (pulls
      deal-hunters, not the branded + local intent this page wants); the preview title
      fixed that but lost the geo — this keeps both fixes. Losing any "free
      bowling"-flavored traffic the old title caught is the intended trade.
      FYI `/rewards` now reads *"Sign up here — takes about twenty seconds, and we'll
      text you a $10 lane credit to start."*
      *(`/free-kids-bowling` keeps "Free Kids Bowling This Summer" — "free" there is
      the program's actual name and the legacy slug, a deliberate standing exception.)*
- [ ] **Venue signage walk (Jon)** — hunt the same `BOWL123 / 85775` keyword promo on the
      **Brunswick Sync screens** and the **road sign**. Jon's ruling: these are useless,
      kill them; do NOT rebuild keyword joins on the new platform.
- [ ] **Decide: winback +7d reminder automations on or off at launch** (recommendation: on
      — one nudge on an unclaimed free offer, month-scoped dedupe caps it at one).
- [ ] **Schedule Patch cancellation before the Aug 15 invoice** (~$580/mo, month-to-month;
      July is paid, so ~2.5 free weeks of post-cutover archive access).
- [x] ~~Kids welcome SMS trim to 1 segment~~ **DONE 2026-07-24** — 198 chars/2 segs →
      **145 chars/1 seg**. Jon's copy, and he chose to **drop the "Reply STOP to opt out"
      line for now** (see §SMS segment discipline for the tradeoff + revisit note).
- [ ] **Zite "Program Health" dashboard** — acceptance check when the build lands
      (liability ≈ 815,569; segments ≈ 23.8k never / 6.5k lapsed / 1.3k cooling / ~1k
      active; NULL metrics render "—" not 0).
- [ ] **Kiosk hardware — the counter iPads.** Jon is doing this on site at cutover.
      **Zite kiosk URL: `https://7hgf6juzff.zite.so`**

      Per-iPad recipe (~5 min each):
      1. **Settings → Display & Brightness → Auto-Lock → _Never_.** Do this FIRST — it's
         the one everybody forgets, and a sleeping kiosk shows a lock screen at 8pm Friday.
      2. Plug in / keep on power. Confirm wifi is the venue network, not a guest SSID.
      3. Safari → open the URL → Share → **Add to Home Screen**. Tap the new icon.
         - **No address bar? ** Zite ships a proper manifest — you're done, it's app-like.
         - **Address bar visible?** No standalone manifest. Fall back to running it in
           Safari and letting Guided Access hide the furniture, or a kiosk-browser app
           (Kiosk Pro ~$20, adds auto-reload + wake-lock + idle reset).
      4. **Settings → Accessibility → Guided Access → On**, set a passcode staff knows
         (NOT the GM PIN). Open the kiosk, triple-click the home/top button → Start.
         Device is now locked to the kiosk; triple-click + passcode to exit.
      5. Retire the Patch iPad app in the same motion (see Phase 1 step 3).

      ⚠️ **Test these before walking away — none are about how it looks:**
      - **Session reset between guests.** After a check-in, does it return to the start
        screen on its own, or only via "I'M DONE — KEEP SAVING"? If a guest walks away
        mid-session, guest #2 must NOT land on their name, points and offers. If there's
        no idle timeout, that's a Zite ask (privacy + someone redeeming another guest's
        offer).
      - **Walk-up NEW guest signup** on the production device — the one kiosk path never
        tested on real hardware.
      - **Wifi blip** — unplug the AP or toggle wifi; confirm it recovers rather than
        parking on an error screen a guest can't clear inside Guided Access.

## Phase 1 — Cutover day (Jul 27) — ORDER MATTERS

1. [x] ~~Swap the URLs first~~ **DONE — merged + deployed; verified native forms live on
       prod `/coupon` + `/free-kids-bowling` (no iframe). Welcome texts confirmed firing:
       11 sent to real new signups over 7/26–27 (7 coupon, 4 kids), TEST_MODE off.**
2. [x] ~~KILL EVERY PATCH AUTOMATION~~ **DONE (Jon, 2026-07-27).**
3. [~] **Retire the Patch kiosk iPad** — Jon converting the iPads to the Zite kiosk on site
       2026-07-27. Confirm the Patch app is fully off each device (it texts on check-in
       independent of automations).
4. [x] ~~Delta export + import~~ **DONE 2026-07-27.** Jon pulled `patch final.csv` (most
       recent ~500, dupes expected — full re-export deliberately skipped, gaps accepted).
       Pipeline run on that file only: 500 unique → 438 keep → committed **54 new customers,
       435 refreshed, +1,200 points** of week's check-in activity. All 54 new import
       quarantined. Staging 0 unprocessed. Kids members 3,228 → 3,262. **This was the final
       Patch export — forms now feed Supabase, kiosk being retired; Patch is read-only.**
5. [x] ~~Verify~~ **DONE — see above (0 unprocessed, 32,409 imports all quarantined).**
6. [ ] **Re-point the Frame social-wall free-game coupons** off Patch (see memory
       `frame-social-wall-coupons-to-loyalty`).

## Phase 2 — Go live (only when the above is green)

- [ ] Re-verify **STOP / START / HELP** on the loyalty number (+1 779-234-4062) — text it
      yourself; a passing workflow execution is not evidence.
- [ ] **Re-enable the automations you actually want** (all are OFF right now): `birthday`,
      `winback-50-initial`, `winback-330-initial`, plus the two `*-reminder` variants if
      that decision came back "on".
- [ ] **LIFT THE QUARANTINE** — the single release:
      ```sql
      UPDATE customers c SET do_not_market = false
        FROM customer_tag t
       WHERE t.customer_id = c.id
         AND t.tag = 'import:quarantine'
         AND NOT EXISTS (SELECT 1 FROM customer_tag b
                         WHERE b.customer_id = c.id AND b.tag = 'import:ban');
      ```
- [ ] Watch the **first Thursday after the lift** — the winback wave fires (~58 people in
      the 49–56d and 329–336d bands). This is also the first real deliverability test.
- [ ] Confirm the health monitor stays quiet (`optin_no_consent`, `stop_not_honored`,
      stuck queues, cron failures).

## Phase 3 — Post-launch queue (no dates)

- [ ] **Avery STOP handling — HARD BLOCKER before any marketing send from her number**
      (confirmed gap: zero `avery_inbound` consent events ever). Also gates releasing the
      `parked:checkout-optin` cohort. Prompt/spec ready.
- [ ] TPRS checkout **consent-evidence** PR (`consent_language`, ip, user_agent,
      `source_ref`) — low urgency; git history is the fallback proof.
- [ ] TPRS booking → `last_engagement_at` bump (makes bookers visible to frequency
      metrics + blast recency without a kiosk punch).
- [ ] Enable **milestone nudges** (`reward-milestone-100/200`) once the base is warm.
- [ ] **Rewards ladder reframe** — the 100/200-pt rungs are cash credits ($10/$20), the
      weakest frame and the most expensive reward; free-unit swaps proposed.
- [ ] **Part A "The Return"** campaign — mid-September, 2,508 one-off bookers, 4 A/B arms
      with holdouts. See `session-handoffs/2026-07-19-avery-rebook-campaign-spec.md`.
- [ ] Points-expiry **warning** automations — calendar item ~15 months out (the expiry
      cron is already live; the warnings are not).

---

## SMS segment discipline (audited 2026-07-23)

Every message costs by **segment**: GSM-7 = 160 chars, but **one non-GSM character
(em dash, curly quote, ellipsis, emoji) flips the whole message to UCS-2 where the limit
collapses to 70.** Segments also consume the T-Mobile 10k/day brand cap, so 2-segment
copy halves effective blast throughput.

Audit result: **14 of 15 stored templates are 1 segment.** Two offenders found:

| Template | Was | Cause | Status |
|---|---|---|---|
| `reward-alert` | 114 chars → **2 segs** | a single **em dash** | ✅ FIXED 7/23 (→ 1 seg) |
| n8n kids welcome | 198 chars → **2 segs** | pure length | ✅ FIXED 7/24 (→ **145 chars / 1 seg**) |

**Kids welcome — live copy (n8n `WF-Loyalty-Forms-Intake` → "Validate & Normalize"):**
> You're in! Free bowling @ Twisted Pin - ends August 14th
> Enter your phone # at our kiosk when you visit.
> Share w/ a friend! twistedpin.com/free

⚠️ **Jon deliberately dropped the "Reply STOP to opt out" line (2026-07-24, "for now").**
Worth knowing the tradeoff: adding it back in any form pushes this past 160 → 2 segments
(there is no ~20-char slack), so the omission is what buys the single segment. What still
holds: **STOP genuinely works** (loyalty inbound handler verified live), carriers honor it
at the network level regardless, and the signup form itself carries the consent
disclosures. What's exposed: CTIA/10DLC best practice expects opt-out instructions in an
opt-in confirmation, and a carrier campaign audit is where a missing STOP line gets
flagged. **Revisit before high-volume marketing** — if it goes back, trim elsewhere
("August 14th"→"Aug 14", drop "when you visit") to stay at one segment.
*(The $10 coupon welcome still carries its STOP line and remains 1 segment.)*

**Measurement query** (run after any copy change):
```sql
SELECT slug, length(body_template) AS chars,
       gsm_segments(body_template) AS segs,
       nullif(regexp_replace(body_template,'[ -~'||chr(10)||chr(13)||']','','g'),'') AS non_gsm
FROM lifecycle_automation WHERE body_template <> ''
ORDER BY 3 DESC, 2 DESC;
```
Note `gsm_segments()` on a raw template *overstates* length — placeholders shrink when
rendered (`{{offer_expires}}` 17 chars → ~5). Substitute worst-case values before judging
anything near the line. `create_blast()` already blocks >1 segment unless explicitly
overridden with `p_allow_multisegment`.

---

## Standing rules (do not relearn the hard way)

- **Two ecosystems, one identity graph.** Loyalty number = walk-in/points/kiosk. Avery =
  bookings. Data bridges them; messaging never crosses.
- **Blasts stay slow** — ~60–100 msg/min, well under the 240/min carrier rate. Jon's
  explicit call; do not tune toward the caps. Full 18.4k blast ≈ 3–5h, so schedule
  early-afternoon, never evening-of.
- **Never quote external redemption benchmarks** — all 14 published ones failed
  adversarial verification. Every campaign carries a **no-offer holdout**; the platform
  benchmarks itself.
- **Phones are E.164 by database trigger.** Don't hand-normalize; don't add a UNIQUE index
  on phone until TPRS matches on phone (it still matches on email only).
- **`do_not_market` carries three meanings** — genuine ban, import quarantine, checkout
  parking — disambiguated ONLY by tags. Always scope releases by tag, never blanket-clear.
