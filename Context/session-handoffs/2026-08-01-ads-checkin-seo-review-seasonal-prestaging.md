# Session Handoff — 2026-08-01: Ads Check-in + Holistic SEO Review + Seasonal Pre-Staging + FKB 2027 Transition

One marathon session, five workstreams. Everything below is LIVE in production
as of tonight. Commits: Ads Script 16 (executed in the Ads UI, file in
`Twisted Pin Full System/google_ads_scripts/`), Website `4d55743` → `963cf8d`
→ `4d87cc4`. Memories updated throughout: [[google-ads-checkin-2026-07-07]]
(running ads log), [[seo-ai-search-posture-2026]], [[fkb-2027-transition-plan]].

---

## 1. Google Ads check-in (Jul 18–31 window) — the delayed 7/31 + the Aug-1 ramp, executed together

**Window:** $953.89 / 411 clicks / 7 counted conv / $136 blended. Trend
$86 → $97 → $136 across three windows = the brief's Jul 6–Aug 2 trough
behaving as predicted. No panic moves.

**THE structural finding — the dashboard undercounts, and we can prove it:**
Supabase `avery_event` showed **9 real gclid-attributed event inquiries** in
the window vs **2 counted** conversions (GA4 lead import caught 2 of 9) —
including a **deposit-PAID $790 company event** (Aug 14) and a $1,090
confirmed-quote birthday. Real Events economics ≈ $41/lead, not the $186
sticker. **Standing rule: never let the Ads Cost/conv column alone drive an
Events decision — cross-check `avery_event` (`gclid is not null` + window +
not test/dry-run).**

**Housing appeal CLEARED** — Corporate Events RSA plain Eligible/Excellent;
the Aug-1 corporate ramp was unblocked and started same day. "2 of 4 ads
limited by policy" = the permanent alcohol floor (expected forever).

**Geo verdicts (the 7/17 experiment paid):** Events — both counted conv from
Naperville ($62.64; the hold-Naperville call vindicated); Aurora ~$187/24d/0
→ −10%. Open Play — both counted conv came from the two boosted conquest
towns (Shorewood +10% → $91 conv; **Romeoville +15%, the Lucky Strike
conquest bet, CONVERTED at $30.45**); Joliet still a pit at −15% → −25%
(cheap CPCs blunt the modifier); Crest Hill reverted to flat (best CTR two
windows running).

**Script 16** (`16_checkin_trims_and_negatives.js`) ran live ~3:25pm CT, zero
errors; an accidental second run doubled as idempotency proof. Contents:
Events $28→$35 + Brand $5→$6 (was budget-capped at $18.72/conv) · corporate
exacts $6.50→$7 · Bar Category AG $3.50→$2.75 · Things To Do AG $1.75→$1.50
(TTD ate 38% of a budget-limited campaign at 0 counted conv) · 51 negatives
(format-mismatch cluster, `bowling` routing off Bar-Led, DIY/activity-content
cluster on Events, wrong-town planners on TTD, plural `"twisted pins"` on all
3 non-brand — negatives don't stem plurals) · geo moves above. **New tooling
pattern: a CONFLICT SCAN before negative adds** (scan enabled keywords for
containment) — it immediately caught that the 7/17 "sports bar plainfield"
clicks came through **our own keyword** (EXACT was paused, PHRASE was live);
both paused + negative added. Keep this pattern in every future ads script.

**Also closed:** Deals AG actually REMOVED (had only been paused since 7/7).
Calls read: "Calls from ads (1)" recorded 4 × 30s+ calls this window — the
7/7 mapping fix confirmed working, baseline ≈2/wk. **Still open (Jon, 30s):**
Submit-lead-form goal shows 3 PRIMARY actions — verify only the GA4
`generate_lead` import is Primary. **Next check-ins:** optional peek ~Aug 15
(did the TTD trim rebalance Open Play?), formal ~Aug 31 (geo reads, TTD
verdict, Auction Insights for Lucky Strike overlap, the Bar-Led $12/day
existential question, calls follow-up). **September:** additive swap of the 3
RSAs carrying "private" (Team Outings + EA descriptions, Corporate headline)
— clean RSAs clear review first, THEN pause old; never edit the just-cleared
Corporate RSA mid-ramp.

## 2. Holistic positioning review (site + SEO + ads as one system)

The old web agency still emails Monthly KPI PDFs — same GA4 property spans
both sites, so 2025 = their site, 2026 = ours, a clean controlled experiment.
**June YoY: users +21%, sessions +32%, brand clicks 292 → 1,100 (CTR 12% →
45% on FLAT impressions — pure SERP capture), `bowling near me` pos 10.3 →
5.8 (12 → 99 clicks), search footprint +42%, booking funnel owned on-domain.**
Their PDFs' red arrows are month-over-month — don't let them scare anyone.

**Three-agent research pass (sources vetted, folklore flagged) produced the
standing verdicts, all logged in [[seo-ai-search-posture-2026]]:**
- **NO paid GEO/AI-visibility tracker** (Visby, Otterly, Profound, etc.) —
  they all poll synthetic prompt lists, tool-to-tool results disagree, and at
  ~24 AI referrals/mo (~0.3% of traffic = exactly the global benchmark) a
  quarterly DIY prompt audit covers it. Re-evaluate only on: AI referrals
  >5% of sessions, Lucky Strike displacing us on money prompts twice, or AI
  inquiries becoming a line item.
- **NO blog cadence** — owned content is ~23% of AI citations even on branded
  queries; the play is third-party mentions (roundup lists, Reddit, local
  press; Ahrefs: mentions correlate 3× stronger than backlinks with AI
  inclusion). Keep + annually refresh the 3 existing posts.
- **Platform changes that mattered:** Yelp licensed 330M reviews to OpenAI
  (7/23/26) — Yelp/Bing Places/Facebook/TripAdvisor are ChatGPT's local data
  supply chain (70 of our 72 AI referrals are ChatGPT) → **the listings
  refresh is the highest-leverage remaining action, before September.**
  GBP Q&A is dead (Ask Maps now answers from the WEBSITE — FAQ blocks are the
  new Q&A surface). FAQ rich results fully removed May 2026 (markup harmless).
  llms.txt = confirmed null signal. **⚠️ Apr 17 2026 review-policy additions
  ban staff quotas + soliciting reviews naming specific content/staff — audit
  the Avery review-ask flow (queued Sep).**

## 3. Website commits — what shipped and why

**`4d55743` (verified list — every claim checked against the repo by an
adversarial workflow before building):**
- **Font-metric CLS fallbacks** in global.css — Lighthouse attributed
  /holiday-parties' mobile CLS 0.10–0.18 entirely to the four web fonts
  swapping on text heroes. Three size-adjusted `@font-face` rules
  (Arial/Georgia squeezed to the web fonts' metrics via @capsizecss/metrics)
  spliced into the three `--font-*` stacks. Site-wide fix; recompute if the
  Adobe kit ever lands.
- **Footer "Explore" row** — the 7 `/why-us/` city pages (incl. Romeoville,
  the #1-competitor conquest page) and all 3 blog guides had ZERO inbound
  internal links. One SnapFooter row de-orphans all 10 on every page. Label
  desktop-only; compact single row (the footer's mobile height is
  100dvh-sensitive).
- Meta trims ≤170 (vip-suite, showers, wedding-receptions, holiday-parties);
  `/bowl` EN+ES "5 minutes from Naperville and Bolingbrook" → unnumbered
  "minutes from" (the city pages carry verified ~10-min/10-mi figures; 5 was
  the site-wide outlier); Pin Pass factual fixes (12 & under, June 1–Aug 14);
  Brian retrain line past-tensed (training ended late July);
  **/reserve-preview2 DELETED** + `bookingPage2Config` + robots line — it had
  also been silently leaking into the sitemap (noindexed URL in sitemap =
  GSC warning class) since its exclusion filter was removed.

**`963cf8d` — seasonal pre-staging + approved copy + league form:**
- **THE PATTERN: build-time date gates + the daily 9 UTC cron rebuild = pages
  that flip themselves.** `const X_MODE = new Date() >= new Date("2026-08-15T00:00:00-05:00")`
  — same mechanic promos.ts/nav-seasonal.ts already used, now applied to page
  CONTENT. Both states build-verified before shipping (temporarily flipped
  the gate dates, built, grepped the output, restored).
- `/free-kids-bowling` → **2027 waitlist mode at midnight CT Aug 15**: TM-safe
  H1 ("Free summer bowling for kids. Back in 2027." — the old H1 contained
  the literal TM'd phrase), waitlist form (no acks), waitlist FAQ + schema,
  birthday/pricing cross-sell; all six hardcoded Aug-14 references flip
  together. `/api/kids-signup` gates at REQUEST time → form_slug
  `kids-free-bowl-waitlist-2027` + tag `program:kids-free-bowl-2027-waitlist`.
- `/summer-pin-pass` → off-season mode same midnight (pass ends Aug 14 per
  Jon): buy CTAs → /pricing, "back spring 2027", Offer → OutOfStock.
  Informational only — deliberately no waitlist form. `/bowl`'s kids
  cross-link card flips too.
- **Promo bar Q4 queue** (approved copy): "Holiday parties — December books
  fast" Aug 15→Dec 15 + "NYE party slots are open — book yours" Nov 15→Dec 31
  (they rotate). The bar never goes dark after the kids promo expires.
- **/holiday-parties FAQ block** (6 Jon-approved Q&As + FAQPage JSON-LD, the
  corporate-events recipe) — the Ask-Maps-era play for the season's money page.
- **/birthday-parties hero sub** now carries both audiences — ads data shows
  adult-birthday queries taking the paid clicks while the hero read kid-only.
- **League interest form on /leagues** (Jon's mid-session ask): name/email +
  structured solo-vs-team + preferred-night selects + message → new
  `/api/league-interest` → Resend email to contactus@ (reply-to submitter;
  from @mail.twistedpin.com per the verified-domain rule; LOUD failure +
  mailto fallback so leads can't silently drop). Placed above the Pro Shop.
  Optional env: LEAGUE_NOTIFY_TO / LEAGUE_NOTIFY_FROM.

**`4d87cc4` — no-confirmation-text waitlist (Jon's call, endorsed):** the
success panel IS the confirmation. Saves the send and — the real win —
preserves consent: every extra text is a STOP opportunity months before the
one spring "signups open" send that matters (same principle as the
checkout-optin no-welcome ruling).

## 4. FKB 2026 → 2027 transition — data, design, and a near-miss

- **Cohort (verified in the loyalty DB):** 3,307 tagged
  `program:kids-free-bowl`; 3,268 arrived via the Patch import; **≈2,490 have
  recorded SMS marketing opt-in with clean deliverability** — the relaunch
  audience. 98.8% also carry `import:quarantine`; decision: LEAVE the hold
  (it protects them from generic blasts) and let next May's send use a scoped
  predicate (kids tag + opt-in + not bounced/DNM) — the rebook-campaign
  "campaign owns its consent predicates" pattern.
- **NO ROLLOVER (Jon):** three-tag model — 2026 tag goes inert; waitlist tag
  = marketing + early-signup day only; a future `program:kids-free-bowl-2027`
  enrollment tag is the only thing the 2027 grant cron/kiosk honor. Re-signup
  is mechanism-enforced and fires the share-a-friend welcome; YoY analysis
  (growth, retention, waitlist conversion, referral proxy) falls out of the
  tags for free.
- **The n8n near-miss:** inspecting `WF-Loyalty-Forms-Intake` before agreeing
  to "no text" revealed that an unknown form_slug fell into the ELSE branch —
  **new waitlist families would have been texted the $10 SAVE10 coupon
  message with a garbled expiry.** Fix (live, made via full-node `updateNode`
  — NEVER `patchNodeField` find/replace on Code nodes, $-expansion corrupts
  them): waitlist slug → `welcome_body = null`, and the SMS Consent? gate now
  also requires `welcome_body != null` (which also closed a latent empty-body
  enqueue path for kiosk signups). Enroll Member needed zero changes — it
  already applies the payload's `program_tag` with no grant for unknown slugs.
- **End-to-end verified against production:** test webhook POST → ok:true,
  tag applied, 0 scheduled_message, 0 grants, opt-in recorded; test customer
  retagged `test-blast` so the 2027 cohort starts at a true zero. (Gotcha
  logged: `customer_tag` inserts need `applied_by_actor_id` — NOT NULL.)
- **Net: NOTHING remains before Aug 15.** The next human touch this program
  needs is the spring relaunch text.

## 5. Errors made and corrected this session (keep the honesty ledger)

- Claimed /coupon's iframe would die with Patch — WRONG (native since 7/24;
  the CLAUDE.md /coupon bullet was two migrations stale — now fixed).
- Urged exporting the FKB cohort from Patch before cancellation — moot (the
  migration already carried it, with consent fields).
- "Unclosed parenthesis" in the holiday meta — false (SiteGuru's PDF mangled
  it); the real issue was length only.
- Said the footer row would carry "8 city links" — only 7 city pages exist.
- Planned to remove FKB's stale Event schema — it was already gone (7/24
  rewrite); the real staleness was six hardcoded dates.
- Repeated CLAUDE.md's "NYE copy is placeholder" — outdated; real package
  copy since June 11. NYE is Q4-ready (ops just opens TPRS sales ~Dec 1).
- One build break (JSX comment as a ternary-branch sibling) — caught by
  diagnostics, fixed before commit.

The pattern behind most of these: **claims sourced from project docs that the
codebase had outrun. Verify against current code before building on any
historical bullet** — the adversarial verify pass exists for exactly this.

## Open items (the honest remainder)

| Owner | When | Item |
|---|---|---|
| Jon | Aug | Listings refresh: Yelp / Bing Places / Facebook / TripAdvisor (the ChatGPT supply chain — highest-leverage remaining action) |
| Jon | 30 sec | Ads: Submit-lead-form goal → only GA4 generate_lead Primary |
| Jon/staff | now | League leads arrive at contactus@ ("League interest —" subjects) |
| Ops | Aug–Sep | Fall events for /upcoming-events (calendar reads empty Aug–Nov) · seasonal holiday menu items · full-buyout capacity number · scrub "Text BOWL123" from Brunswick screens |
| Claude | Aug 15 | Morning-after check that all pre-staged flips took |
| Claude | ~Aug 31 | Formal ads check-in (geo, TTD verdict, Auction Insights/LS overlap, Bar-Led question, calls) |
| Claude | Sep | "Private"-free RSA swap · leagues page in-season update · Avery review-ask audit vs Apr-2026 policy |
| Claude | ~Nov | First quarterly DIY AI prompt audit |
| Both | early Sep | Local roundup pitches (holiday-party listicles get written Sep–Oct) + owner-disclosed Reddit presence |
| — | next May | FKB relaunch: page flips back, one SMS to ~2,490 + waitlist ([[fkb-2027-transition-plan]]) |

## Durable mechanics established today (reuse these)

1. **Date-gated page states + daily cron rebuild** = seasonal content that
   flips itself. Test both states by temporarily flipping the gate date and
   building.
2. **Ads-script conflict scan** before negative adds.
3. **avery_event ground-truth query** before trusting any Ads conversion
   number.
4. **Capsize font-fallback recipe** (values + formula in global.css comments).
5. **n8n Code-node edits: full-node updateNode only** — never find/replace.
6. **The verification-workflow habit:** research claims and repo claims both
   got adversarial passes before money or code moved; both passes caught
   real errors.
