# Loyalty Platform — Go-Live Checklist

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
      ⚠️ Two copy decisions carried over from the preview page, worth 30 seconds of
      Jon's eyes before merge: (a) the `/coupon` `<title>` became *"Get $10 Toward Your
      Next Lane | Twisted Pin"*, dropping the geo the old live title carried (*"Free $10
      Lane Credit in Plainfield, IL"*) — the description still says Plainfield, IL;
      (b) `/rewards` now reads *"Sign up here — takes about twenty seconds, and we'll
      text you a $10 lane credit to start."*
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
- [ ] Kiosk hardware plan — Zite kiosk URL pinned on the iPads (PWA + Guided Access, or a
      kiosk-browser app), **screen-sleep disabled**, wifi-drop behavior tested.

## Phase 1 — Cutover day (Jul 27) — ORDER MATTERS

1. [ ] **Swap the URLs first** — this stops new contacts entering Patch. (Patch was still
       acquiring signups at 12:36am and checking guests in at 12:20pm on 7/19; a pre-swap
       export guarantees stragglers.)
2. [ ] **KILL EVERY PATCH AUTOMATION** — birthday, check-in, coupon flows. Both platforms
       live = guests double-texted. *(Jon asked explicitly to be reminded of this.)*
3. [ ] **Retire the Patch kiosk iPad** the same moment the Zite kiosk goes on the counter —
       automations-off does NOT stop the kiosk from texting on check-in.
4. [ ] **Delta exports from Patch** — two small pulls: contacts `created_at` > bulk-export
       date, and contacts whose `last_checkin_at` > bulk date (points/visits move).
5. [ ] **Re-run the import pipeline** — `clean-contacts.mjs` → `load-staging.mjs` →
       `patch_import_dryrun()` → `patch_import_commit(prefix)` per digit. Counters apply
       as **diffs** (`*_applied`), so Patch points earned since 7/19 come across correctly.
6. [ ] Verify: 0 unprocessed staging rows, no unexpected new customers, spot-check a
       known guest.
7. [ ] **Re-point the Frame social-wall free-game coupons** off Patch (see memory
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
