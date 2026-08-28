# Session Handoff — 2026-08-28: Ads check-in (Aug 14–28) + Script 18 LIVE + attribution first-read + SiteGuru/alcohol-policy triage

Read this before the ~Sept 14 Google Ads check-in. Memory of record:
`google-ads-checkin-2026-07-07.md` (the running Ads log — Aug 28 block appended, July calls note corrected).

## 1. Google Ads — Aug 14–28 window, Script 18 ran LIVE

**Dashboard:** $1,082.94 / 433 clicks / 9 counted conv / $120 blended.
**Ground truth (`avery_event`, gclid-attributed, tests excluded):** 9 real inquiries —
5 company events (incl. **two 100-head: Oct 20, Dec 12**), 3 birthdays (31 / 9 / 35 guests), 1 small group.
3 counted Events conv → real Events ≈ **$55/lead**, not the $164 sticker. Q4 corporate arrived on the brief's schedule.

| Campaign | Spend | Counted conv | Verdict |
|---|---|---|---|
| Events $35/day | $493.43 | 3 ($164) | Corporate Events AG 82 impr (was 27) after $7 bid, 1 conv @ $34.58 — cheapest. Team Outings 66 clicks/2 conv. Birthday $4 raise bought clicks (22/$99/0) but 3 real birthday inquiries → **hold**. |
| Open Play $32 | $426.30 | 3 ($142) | Bowling AG absorbed freed TTD budget only partly ($137/conv vs ~$86 target) → hold $32. TTD 10 clicks/$14/0. |
| Brand $6 | $83.13 | 3 ($27.71) | Healthy, still limited-by-budget; Jon already ruled no raise. |
| Bar-Led $12 | $80.09 | 0 | **5th straight zero window.** Every clicked term = competitor-nav (rise and pour, champions, uptown, fuzed) or out-of-market bachelorette (nashville, kansas city, charleston, lake geneva). Cocktails AG 19 impr/0 clicks; Beer Wall 3 impr. |

**Script 18 (`Twisted Pin Full System/google_ads_scripts/18_checkin_geo_flip_and_negatives.js`) — LIVE 2026-08-28 ~5:28pm CT, zero errors, second live run confirmed idempotent (every geo line "already at target").**
- **Geo inverted from Aug 1:** Aurora converted in BOTH campaigns while penalized (OP $34.50 = cheapest in campaign; Events $91.85) → penalties removed (OP 0.85→1.00, Events 0.90→1.00). **Jon's ruling: penalty removal only, NEVER a boost on one window's data** (Aurora is a driving-distance outlier). Romeoville repeated on EVENTS ($21.56, cheapest) while its +15% boost sat on OP (0 conv) → OP 1.15→1.00, Events 1.00→1.10. Shorewood OP +10% was top spender $88/0 → 1.00. Joliet −25%, Oswego −15%, Crest Hill flat all HELD.
- **Naperville/Events $166.99 / 35 clicks / 0 counted — HELD by Jon:** "huge possibility for us, will take time to gain the proper momentum." Don't re-pitch a trim. The two 100-head company leads carry no city on `avery_event`; place them by company name (Missive threads) for the Sept 14 read.
- **30 negatives, 0 conflicts:** Events campaign-level 25 — `gift` SINGULAR (Script 16 did `gifts`; negatives don't stem — same lesson as `twisted pins`), HR-ideas drift on Employee Appreciation (prizes swag awards raffle recognition incentivize wellness "work anniversary"), DIY team-building on Team Outings ("cup stacking" "spaghetti tower" "egg drop" "flower arrangement" painting cooking survivor "office olympics" "murder mystery" crafts "lincoln marsh"), youth/athletic ("girl scout" cheer "sports teams" athletic), `oak brook` (took a $4.97 Events click; Script 16 only had it on TTD). TTD AG-level 5 — waterpark, "escape rooms", "escape room", outdoor (Events had it since 15, OP never did), bars.
  Held ambiguous (standing ruling): retreat / workshop / exercise. Kept on purpose: halloween / christmas / holiday-party / fall terms (Q4 thesis) and all kids/family terms on TTD. **NOT negatived:** `private …` venue close-variants still matching Birthday AG (0 clicks; real venue intent even though the word is banned in our copy) — open judgment call.
- **Budget section BUILT but OFF (`RUN.budgets: false`):** Bar-Led $12→$6 with the $6 to Events ($35→$41, now "limited by budget soon"). **Jon did not rule.** Flip the toggle and re-run; everything else no-ops.

**CALLS ITEM CLOSED — and the July record was wrong.** Call assets Aug 14–28: 407 phone impressions → **2 actual phone calls** (PTR 0.5%), 68 *Interactions*. The 7/7 note "96 call clicks / $1.91 per call / 21% of spend" read the **Interactions** column (clicks on the ad while the call asset showed), not Phone calls. The recording chain is fine; the input is ~1 call/week and Roy answers in <30s. Memory corrected. Don't re-chase. The Phone-call-lead goal showing "2 primary actions" = the system-locked fossils; inert, not worth UI time.

**Calendar:** ~**Sept 14** check-in — did Aurora/Romeoville hold up at flat/+10%; did Events itemized terms finally convert post-negatives (34 clicks/$165/0 two windows running, all counted conv from "Other search terms"); Naperville corporate read with the 100-head leads placed by city. ~Sept 15 Corporate impressions. Sept: Events toward $40+ if the budget toggle stayed off. Nov 23–25 Black Wednesday pulse; Dec 28–31 NYE pulse. Standing: do NOT edit the Corporate RSA (cleared Housing 8/1); dismiss budget recs, never "Apply all" RSA/sitelink recs; Manual CPC until 30+ conv/30d sustained (~18/30d now).

## 2. Attribution — first-ever channel read (it was already being captured; nobody had queried it)

Pipeline: `src/scripts/gclid-passthrough.client.ts` captures gclid/gbraid/wbraid/gad_source/utm_*/fbclid → appended to every Zite CTA → WF1 writes `avery_event.gclid / fbclid / utm_* / referrer` + derived **`attribution_source`** (`google/cpc`, `fb/paid/<campaign-id>`, `ig/paid/<id>`, `chatgpt.com`, `direct`). Meta campaign IDs are in there.

**Jul 1 → Aug 27, form inquiries only, tests excluded:**

| Source | Inquiries | Booked (tprs_booking_id) | Rate |
|---|---|---|---|
| Direct / organic | 139 | 17 | 12% |
| Google Ads | 40 | 5 | 12.5% |
| **Meta paid** (2 campaign IDs) | **9** | **0** | 0% |
| ChatGPT referrals | 5 | 0 | — |

Google converts at direct's rate — paid leads aren't lower quality. **Meta spend is UNKNOWN in-repo** (a `meta_scripts` folder exists in `Twisted Pin Full System`, not opened) — **the single biggest open blind spot in marketing spend.** Jon owes a Meta Ads Manager spend screenshot Jul 1→today.

**Query trap:** 237 SMS rows with no attribution and no `guest_count` are visit-feedback / rebook conversations riding the same table — NOT inquiries. A naive `count(*)` on `avery_event` overstates inquiries ~2×. Filter on `attribution_source IS NOT NULL` (Zite always sets it) or `guest_count IS NOT NULL`. "Booked" = `tprs_booking_id IS NOT NULL` only — a floor, but an equal floor across sources.

Not built (offered, not requested): a saved month × source × outcome query as a standing column next to the Ads dashboard.

## 3. SiteGuru audit (26 Aug, 97%) — nothing actionable, verdicts of record

- **"5 pages not indexable"** = the linked `noindex,follow` legal pages (privacy, terms, sms, sms-marketing, accessibility). Intentional. Staff surfaces are robots-Disallowed AND unlinked so the crawler never saw them.
- **Page speed (6 pages 79–88)** = stale cached PSI. Fresh PSI mobile: `/rewards` **99 / 1.0s LCP**, `/pricing` **99 / 1.7s LCP**. **This closes the "/pricing 3.6s LCP — separate investigation" item open in CLAUDE.md since 2026-05-17.** Treat SiteGuru speed scores as noise unless a fresh PSI run agrees. `/waitlist` 83 is the TablesReady iframe — rebuild decision, not a perf fix.
- **3 long meta descriptions** (171–176 chars): `holiday-parties.astro:169`, and the **off-season branches** of `free-kids-bowling.astro:117` + `summer-pin-pass.astro:65` (only live since the Aug 15 date-gate flip — no prior audit could have seen them). ~5–10 chars each. **Not trimmed** — Jon: "not much to gather… nothing super actionable." The report's `(up to 200, in-house catering.` unbalanced paren is a PDF extraction artifact; source is correct.
- **`/es/bowl` 0 internal links — KEEP.** Jon asked whether it's still needed now the Spanish ad group is cancelled. Answer: ads were half the rationale; the organic half survives (`boliche cerca de mi` was already pulling ~68 clicks to the English page, zero Spanish competition, 9.6% Hispanic local market). hreflang triplet on `bowl.astro:87-89` is intact; SiteGuru counts only `<a>` links and there is no visible anchor. Cost to keep ≈ copy drift when `/bowl` changes. Kill path if GSC shows zero over 3 months: delete page + strip hreflang + 301 `/es/bowl/ → /bowl/`. Not decided; leaning keep.
- Everything else (canonicals, titles, H1s, alt, OG, broken links, redirects, sitemaps, 404s) clean.
- No prior SiteGuru PDF exists anywhere under `dev/` — if there is an earlier one it's in email/Drive.

## 4. Google Ads alcohol-policy email (Sept 30 2026 update) — no action

The email's "review" link resolves to `support.google.com/adspolicy/answer/17404252` (the preview article; not findable by search yet). Read against the account:
- Mass mailing to every advertiser with an "Alcohol information" label — Bar-Led's 9-of-10 ads have carried it since May.
- **US: no change** — no US-specific row, no ABV limit, no certification. Same age rules.
- **"0% alcohol re-certification" + "suspended without prior warning"** apply ONLY to Egypt / India / Indonesia (standard alcohol ads banned there). Not applicable.
- **"Irresponsible alcohol" revisions** are a rewording, not new prohibitions; nothing about happy hour / free drinks / unlimited / promotions was added. All live Bar-Led copy checked clean (`Pay by the ounce`, `Try a few sips before committing to a pint` are the *opposite* of excessive-consumption framing; `Built for Adults` describes audience not outcome).
- Only visible effect: after Sept 30, Bar-Led ads may briefly show **two policy labels** — cosmetic, self-resolving. Don't appeal, don't edit an ad because of it (Corporate RSA rule still applies).

## 5. Open items, ordered

1. **Meta Ads Manager spend, Jul 1 → today** (Jon) — turns 9/0 into a cost-per-lead next to Google's ~$55.
2. **Bar-Led $12→$6 / Events $35→$41 ruling** — Script 18 `RUN.budgets` toggle.
3. UI: dismiss budget recs; don't apply RSA/sitelink recs.
4. Place the two 100-head company leads (E-9186257 Oct 20, E-0614790 Dec 12) by city before Sept 14.
5. Optional, unrequested: meta-description trims; "En español" anchor on `/bowl`; saved attribution query.

## 6. Repo state at close

Committed this session: this handoff + a CLAUDE.md In-Progress pointer. **Left untouched, not mine:** 12 modified `public/snap/stage-*` images (another session's re-encode) and the untracked `Context/session-handoffs/2026-08-25-zite-when-block-vague-inquiries.md` (referenced by CLAUDE.md but never `git add`ed — whoever owns the 8/25 session should commit it). Script 18 lives in `Twisted Pin Full System`, which is a separate tree.
