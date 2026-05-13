# Launch Cutover Runbook

**The single tactical doc for the actual cutover event.** Open this on
launch night and execute top to bottom.

For *background and theory*, see [dns-migration.md](dns-migration.md)
(partially superseded — that doc describes the old GoDaddy-DNS plan;
current strategy is Vercel DNS; see Decision Log).

For the *long-term running list*, see [launch-checklist.md](launch-checklist.md).

Last updated: 2026-05-12.

---

## ⚡ TL;DR — where you are right now

✅ **Live site is 100% untouched.** Everything done so far has been Vercel-side only. DNS still points at the dev company's Cloudflare → site keeps serving normally → email keeps flowing normally.

🎯 **Strategy:** **Path B — Vercel DNS.** Pre-stage every record in Vercel's DNS UI BEFORE flipping nameservers at GoDaddy → zero-gap cutover.

⏳ **Next steps when you return:** finish Phase 0 audits (mostly done), execute Phase 1 (pre-launch code work), execute Phase 2 (populate Vercel DNS), execute Phase 3 (flip nameservers), Phase 4 verify, sleep, Phase 5/6 cleanup the next day.

📍 **You are here:** between Phase 0 and Phase 1.

---

## 📋 Phase 0 — Pre-flight safety checks

These can't break anything. They surface blockers BEFORE you flip nameservers.

| Check | Status | Result |
|---|---|---|
| Vercel Pro upgrade complete | ✅ | TOS-compliant; Web Analytics included |
| Both domains added in Vercel (www → Production, apex → 307 → www) | ✅ | Both showing "Invalid Configuration" — expected until DNS flips |
| Google Search Console ownership | ✅ | User-owned; 10,507 clicks visible |
| Google My Business / Business Profile ownership | ✅ | User-owned |
| CAA records check (would block cert issuance) | ✅ | **None** — Let's Encrypt cert will issue cleanly |
| MX records verified (smtp.google.com priority 1, single record) | ✅ | Modern setup, record sheet is correct |
| Vercel cron survived upgrade | ✅ | `/api/cron/rebuild` enabled at 09:00 UTC |
| SPF malformed-token confirmed via MX Toolbox | ✅ | Real `permerror` — cleanup justified |
| GSC indexed URLs audit (export → compare against vercel.json redirects) | ✅ | 18 redirects added to `vercel.json` covering: legacy bar/tap-wall variants, family-party, wp-suite, recurring-event wildcards (bar-bingo-free + karaoke-free), 2 old promo blog URLs, and 7 why-us non-`-il` variants. Build verified. |
| Subdomain enumeration (DNSDumpster + crt.sh Certificate Transparency) | ✅ | Only `twistedpin.com`, `www.`, `event.` (Heyflow), `menu.` (Zite) exist. Wildcard cert issued but no specific subdomain in use. Zero surprises. |
| Other email senders audit (POS, newsletter, etc.) | ⏳ | Recommended — gmail `from:@twistedpin.com` filter, last 6 months. Anything automated may need SPF include. |
| Vercel env vars inventory complete | ⏳ | See Phase 1B checklist |

### Outstanding Phase 0 work (1 item, ~10 min)

#### Other email senders audit (10 min) ⏳
In Gmail, search `from:@twistedpin.com` filtered to the last 6 months. Anything you didn't personally send (newsletter, POS receipt, booking confirmation, etc.) is an automated sender. Share the list — we'll verify each one's SPF include is in the new SPF record (currently only Google Workspace + Freshdesk).

### Phase 0 — completed audits (for reference)

#### Subdomain enumeration ✅
- **DNSDumpster** scan returned only `www.twistedpin.com` on 3 Cloudflare IPs.
- **crt.sh Certificate Transparency** logs (exhaustive — every cert ever issued) returned only:
  - `twistedpin.com` (apex)
  - `www.twistedpin.com`
  - `event.twistedpin.com` (Heyflow)
  - `menu.twistedpin.com` (Zite)
  - `*.twistedpin.com` (wildcard cert — no specific subdomain in active use)
- **Conclusion:** the Vercel DNS record sheet is complete. No hidden subdomains.

#### GSC indexed URLs audit ✅
- Exported issue summary CSV: 24 Not Found, 13 Page with Redirect, 4 Alternate Canonical, 3 Noindex, 1 403, 37 Crawled-not-indexed, 5 Discovered-not-indexed.
- Drilled into each category in GSC; captured URL-level data via screenshots.
- **18 redirects added** to `vercel.json` covering high-value URLs. Categories:
  - 3 bar/tap-wall variants (`/bar-grill`, `/self-serve-beer-wall`, `/beer-wine-wall`)
  - `/family-party` → events
  - `/wp-suite` → vip-suite
  - 2 old promo blog URLs
  - 4 recurring-event coverage rules (bar-bingo-free + karaoke-free, each base + wildcard)
  - `/events/16` → upcoming-events
  - 7 why-us non-`-il` variants → matching `-il` pages
- Items deliberately let to 404 (low-value, Google will deindex): `/wp-admin/`, `/wp-content/*`, `/feed/`, WP date archives (`/2024/08/`, `/2025/06/`), WP post ID URLs (`/?p=N`).

---

## 🔧 Phase 1 — Pre-launch work (does not affect live site)

Do these when you're ready to start moving toward launch. None of them break or expose anything; they only affect the Vercel staging URL until DNS points there.

### 1A. Code merge — bundled commit ⏳

Worktree `claude/peaceful-wiles-d21659` contains:

| Item | What it does |
|---|---|
| `src/lib/links.ts` | PLAN_EVENT_URL constant module — 1-line Avery on/off toggle |
| 19 .astro files | Refactored to import the constant |
| `src/layouts/Base.astro` | `<Analytics />` (Vercel) + Microsoft Clarity inline script (project `wq8e536e4r`) |
| `package.json` + lockfile | `@vercel/analytics` dependency |
| `vercel.json` | 18 additional 308 redirects from GSC audit |
| `Context/launch-cutover-runbook.md` | This file |
| **Still needed before merge** | Update `astro.config.mjs` `site:` URL → `https://www.twistedpin.com` |

**Trigger:** when you say "go ahead and merge," I update astro.config + commit + push. Vercel auto-deploys staging in ~90s. Old site unaffected (DNS still on Cloudflare).

### 1B. Vercel env vars inventory ⏳

Vercel project → Settings → Environment Variables (Production scope). Confirm each:

| Variable | Used by | Add? | Remove? |
|---|---|---|---|
| `GOTAB_CLIENT_ID` | Cocktail + food menus | Should exist | |
| `GOTAB_CLIENT_SECRET` | Cocktail + food menus | Should exist | |
| `GOTAB_LOCATION_ID` | Cocktail + food menus | Should exist | |
| `UNTAPPD_EMAIL` | Tap list | Should exist | |
| `UNTAPPD_API_KEY` | Tap list | Should exist | |
| `UNTAPPD_LOCATION_ID` | Tap list | Should exist | |
| `CRON_SECRET` | Daily rebuild (Vercel auto-injects, may not show in UI) | Auto | |
| `VERCEL_DEPLOY_HOOK_URL` | Daily rebuild target | Should exist | |
| `GOOGLE_MAPS_API_KEY` | Live hours on /pricing | **Add** | |
| `GOOGLE_PLACE_ID` | Live hours on /pricing | **Add** | |
| `PATCH_API_KEY` | Abandoned (was for /coupon) | | **Remove** |
| `PATCH_ACCOUNT_ID` | Abandoned (was for /coupon) | | **Remove** |

### 1C. Smoke test the staging site ⏳

Click through every nav item, every drawer item, every footer link on `https://twistedpin-website.vercel.app/`. Anything broken now is broken on launch — fix while you have time.

### 1D. Pre-flight email baseline (optional, 5 min) ⏳

From personal Gmail, send a test to `contactus@twistedpin.com`. Open the message in Gmail, click "Show original" (3-dot menu → Show original), save/screenshot the `SPF / DKIM / DMARC` headers. This is your **before-picture** for post-flip comparison. If post-flip headers don't match the before-picture, you know exactly when something changed.

### 1E. (Optional, 5 min) Confirm Freshdesk SPF include ⏳

Open a chat with Freshdesk support. Ask: *"For SPF records, is `include:freshemail.io` the correct include for your sending infrastructure in 2026?"* If yes → confirmed. If no → update SPF in the record sheet before flip.

---

## 🚀 Phase 2 — Populate Vercel DNS zone (~15-25 min)

**This is the first irreversible-ish step — but it still doesn't affect the live site.** You're populating the new authoritative DNS zone with all records. Vercel DNS isn't authoritative for your domain yet (nameservers still point at Cloudflare), so this is just preparation. The records become live in Phase 3.

**Where:** Vercel project → Domains → click `twistedpin.com` → **Vercel DNS** tab → Add Record (for each record below).

**Automatic — don't manually enter:**
- Apex `A @` → Vercel auto-provisions when DNS goes live
- `CNAME www` → Vercel auto-provisions when DNS goes live

**Manual — add each of these:**

```
═══════════════════════════════════════════════════════════════════════
VERCEL DNS RECORDS TO ADD (10 records)
═══════════════════════════════════════════════════════════════════════

EMAIL — Google Workspace (DO NOT CHANGE values)
─────────────────────────────────────────────────────────────────────
MX     @       smtp.google.com    Priority 1     TTL 3600
TXT    @       google-site-verification=_pgfrXHaLPR_h0TWvoBve5n9a_8v4zSQzyDWwIjh_pA
                                                 TTL 3600

DKIM (long key — paste exactly from dns-migration.md, line-wrapped here)
─────────────────────────────────────────────────────────────────────
TXT    google._domainkey
       v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp++Cg
       mswRN1jrAt9XcB7sTuSWVD8J9Cg/sZof1FioIWl4mC3o0r0VKW9BsPA68mOAzfurMqW
       pCIcU3WWecRbZuaDU8Sr6hXjRvmr9I5WVjnVtVuVBakrZucgn6RjsLasH3HEodItHTc
       snjW8lUueGDWXYM0N/P6ILtR/GwBqvt/Z/xA5FHj6RsJZkjIct/OXOMp8NcSmwHghjX
       br2rQLlzbq6hYmFOwlcX2sozTGRCNDnCj0DLa/YjfDjceI6vC2ZLf36Qz61njmMkvf9
       juhpQ7V4r6iBqfN8uDFLPhSCXZo/Nl8JvOlw8BCYPrcZ05dafxCNySTyuwhZu3hbYr2
       AQIDAQAB
                                                 TTL 3600
       (paste as ONE continuous string, no line breaks)

DMARC
─────────────────────────────────────────────────────────────────────
TXT    _dmarc
       v=DMARC1; p=quarantine; sp=quarantine; pct=100; aspf=r; adkim=r;
                                                 TTL 3600

SPF — CLEANED UP (drops broken token + dev-company GCP IP)
─────────────────────────────────────────────────────────────────────
TXT    @       v=spf1 mx include:_spf.google.com include:freshemail.io ~all
                                                 TTL 3600

EMAIL — Freshdesk DKIM
─────────────────────────────────────────────────────────────────────
CNAME  zbdjb._domainkey    wl756589s1.domainkey.freshemail.io   TTL 3600
CNAME  6r4zq._domainkey    wl756589s2.domainkey.freshemail.io   TTL 3600
CNAME  1s3._domainkey      wl756589s3.domainkey.freshemail.io   TTL 3600
CNAME  fwdkim1             spfmx1.domainkey.freshemail.io       TTL 3600

VENDOR SUBDOMAINS (don't break Heyflow / Zite)
─────────────────────────────────────────────────────────────────────
CNAME  event   flow.heyflow.domains              TTL 3600
CNAME  menu    sites.zite.com                    TTL 3600
═══════════════════════════════════════════════════════════════════════
```

**Notes:**
- For subdomain records, enter just the prefix (`www`, `event`, `_dmarc`, `google._domainkey`, etc.) — Vercel auto-appends the domain.
- For the apex, Vercel may use `@` or blank — check the placeholder text.
- The long DKIM key MUST be a single continuous string (no line breaks). Copy carefully.
- TTL: Vercel may default to "Auto" — that's fine. Or enter 3600.

**Sanity check before Phase 3:** all ~10 records visible in the Vercel DNS zone list. No typos in the DKIM key (a single dropped character = mail to spam after flip).

---

## 🔄 Phase 3 — The flip (~2 min)

**This is the actual moment of cutover.** Tells GoDaddy "Vercel is now authoritative for DNS."

1. **GoDaddy → twistedpin.com → DNS → Nameservers tab → Change Nameservers**
2. Switch from **Custom** (`demi.ns.cloudflare.com` + `peyton.ns.cloudflare.com`) to **Custom** again, but enter Vercel's:
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`
3. **Save.** That's the cutover.
4. Within ~5–30 min: Vercel domains flip from "Invalid Configuration" → "Valid Configuration." Let's Encrypt cert auto-provisions at that moment.

The pre-staged zone in Phase 2 means there's no record-entry scramble. Vulnerability window is effectively zero.

---

## ✅ Phase 4 — Verify (10–30 min after flip, from mobile data)

**Use cellular data, not office WiFi.** Office WiFi may use cached DNS that still resolves to Cloudflare for a while; cellular is a fresh resolver.

| Check | How | Pass = |
|---|---|---|
| Vercel site loads | Visit `twistedpin.com` from phone | Redirects to `www.twistedpin.com` → site loads |
| HTTPS / cert | Address bar | Green lock, no warnings |
| Heyflow form loads | Visit `event.twistedpin.com` | Current Heyflow form serves |
| Zite menu loads | Visit `menu.twistedpin.com/essential` | Zite menu picker loads |
| Email inbound | From personal Gmail → `contactus@twistedpin.com` | Arrives in inbox |
| **Email outbound + auth** | From `contactus@` → personal Gmail → **Show Original** | **`SPF: pass` + `DKIM: pass` + `DMARC: pass`** |
| Freshdesk outbound | Trigger one Freshdesk reply | Lands in recipient inbox, not spam |

**THE CRITICAL ONE: the email headers test.** If all three pass, you can sleep. If anything says `softfail`, `fail`, or `temperror`, investigate before sleeping — that's the failure mode that quarantines real customer mail to spam.

---

## 🆘 Phase 5 — Escape hatch (if anything looks wrong)

**GoDaddy → Nameservers → Change Nameservers → Custom → `demi.ns.cloudflare.com` + `peyton.ns.cloudflare.com`** → Save.

Most resolvers pick up the revert within minutes. Vercel DNS zone stays populated; you're just temporarily telling the world to go back to Cloudflare. Investigate the next day, retry when ready.

---

## 🧹 Phase 6 — Next-day cleanup (~48 hrs after stable)

| Task | Why |
|---|---|
| Confirm both Vercel domains show "Valid Configuration" with cert active | Sanity check |
| Re-test SPF in MX Toolbox | Should now show `Syntax: Valid`, no `permerror` |
| Re-verify Freshdesk DKIM in their dashboard | May have shown red while DNS was on Cloudflare; should re-verify now |
| Update GBP website URL → `https://www.twistedpin.com` | Removes any redirect chain on the listing |
| Submit sitemap to Google Search Console (`/sitemap-index.xml`) | Tells Google about the new URLs |
| Request indexing for top 10 pages in GSC | `/`, `/events`, `/vip-suite`, `/bar`, `/eat`, `/bowl`, `/menu`, `/free-kids-bowling`, `/why-us/naperville-il`, `/upcoming-events` |
| Confirm Vercel Web Analytics showing real visitor data | Should see real visitors within ~30 min of going live |
| Confirm Microsoft Clarity showing first session recordings | First sessions appear within ~30 min |
| Email the dev company: "DNS has moved off your Cloudflare zone" | They have no leverage at this point |
| **Cancel dev company autopay / recurring invoice** | Don't keep paying for hosting you don't use |
| Bump TTL on Vercel DNS records to 3600+ if not already | Steady-state value |
| Flip apex `twistedpin.com → www.twistedpin.com` redirect from 307 → 308 Permanent in Vercel | After ~7 days of stable operation |

---

## 📊 Phase 7 — Post-launch (Week 1-2)

| Task | When | Time |
|---|---|---|
| **Set up Bing Webmaster Tools** | Day 1-2 | 3 min (import from GSC) |
| **Submit sitemap to Bing** | Day 1-2 | 1 min |
| **Set up UptimeRobot** | Day 1-2 | 5 min (free plan: monitor twistedpin.com + event.twistedpin.com + menu.twistedpin.com) |
| **Daily GSC indexing check** | First 7 days | 2 min/day |
| Run PSI on the production URL | Day 3-5 | 5 min — establishes real-domain baseline |
| Verify analytics tools collecting data | Day 1, Day 7 | 5 min each |
| Update `/privacy` page to disclose Clarity + Vercel Analytics | Day 1-7 | 15 min (or flag for counsel review pre-final) |
| Counsel review of `/privacy`, `/terms`, `/accessibility` | When counsel available | External |
| **Monitor "Page with redirect" report in GSC** | Weekly for 60 days | 5 min/week (catches missing redirects) |
| Submit to HSTS preload list | Anytime | 5 min — [hstspreload.org](https://hstspreload.org) |

---

## 🏗️ Phase 8 — Long-term / situational

| Trigger | Action |
|---|---|
| First Google Ads campaign launches | Add Google Ads conversion tracking; confirm Zite captures `gclid` parameter |
| First Meta ads campaign launches | Add Meta Pixel |
| Avery (AI sales agent) proven on Zite | Move Zite custom-domain slot from `menu.` to `event.`; cancel Heyflow; flip `PLAN_EVENT_URL` toggle if needed |
| Real photography lands | Replace all stub images; re-test Lighthouse against new baseline |
| 6 months post-launch | Reconsider Vercel Speed Insights ($10/mo) if iterative perf work becomes active priority |
| 3+ ad tracking pixels active simultaneously | Reconsider Google Tag Manager (worth the perf cost at that volume) |
| Yext citations review | Verify all citations point at `https://www.twistedpin.com` (with `www` and `https`) |
| `plainfieldlanes.com` / `thetwistedpin.com` | Separate session — decide if active forwards or full migration |

---

## 📝 Decision Log

- **2026-05-12 — Vercel Pro upgraded.** TOS requires Pro for commercial use. $20/mo for TOS compliance + Web Analytics / email support / team-access optionality.
- **2026-05-12 — Web Analytics: free tier (included with Pro).** Cookieless, no GDPR consent banner needed, 12 months viewable history.
- **2026-05-12 — Speed Insights: skipped.** $10/mo + $0.65/10k. PSI is free with same CrUX data. Revisit ~6 mo post-launch.
- **2026-05-12 — Microsoft Clarity added (free).** Project `wq8e536e4r`. Heatmaps + session recordings. Async load via `is:inline` script in `<head>` — near-zero LCP impact.
- **2026-05-12 — GA4: deferred until ads start.** Zite captures UTMs to "Avery Analytics sheet" → no immediate need. Add when paid ad campaigns require cross-channel attribution.
- **2026-05-12 — GTM: deferred.** 200-400ms LCP penalty doesn't earn cost at 2-tool stack; revisit at 3+ pixels.
- **2026-05-12 — Bing Webmaster + UptimeRobot: Day 1-2 post-launch.** Zero perf cost; deferred only because lower urgency.
- **2026-05-12 — GSC + GMB ownership confirmed.** User owns both — biggest pre-flip risk removed.
- **2026-05-12 — www-canonical chosen over apex-canonical.** Matches `astro.config.mjs` `site:` URL plan; `twistedpin.com` 307-redirects to `www.twistedpin.com` (flip to 308 post-stability).
- **2026-05-12 — Other GoDaddy domains (`plainfieldlanes.com`, `thetwistedpin.com`) out of scope.** Defensive registrations; addressed separately.
- **2026-05-12 — STRATEGY: Path B (Vercel DNS) chosen over Path A (GoDaddy DNS).** Original plan in [dns-migration.md](dns-migration.md) was GoDaddy DNS. Discovered Vercel offers full DNS hosting. Adopting because: (1) lets us pre-stage records BEFORE flip → zero-gap cutover instead of 5-15 min vulnerability window; (2) apex A + www CNAME auto-configured by Vercel; (3) one fewer vendor surface — already paying for Vercel Pro. Trade-off accepted: Vercel outage = both site AND mail affected. Mitigated by Vercel's strong DNS uptime history.
- **2026-05-12 — Pre-flight safety checks complete.** CAA records: none (Let's Encrypt will issue). MX records: single modern `smtp.google.com` priority 1 (not legacy 5-record). Vercel cron: enabled, survived Pro upgrade. SPF malformed-token confirmed broken via MX Toolbox.
- **2026-05-12 — BIMI: skip.** Requires paid VMC certificate ($1500/yr). Not worth the spend for a venue. Defer indefinitely.
- **2026-05-12 — HSTS preload submission: post-launch.** Already configured in `vercel.json` headers; submission to [hstspreload.org](https://hstspreload.org) is post-launch optional.
- **2026-05-12 — Google Ads attribution strategy decided (deferred until ads start).** Three paths surfaced: (A) conversion pixel on Zite's success page — preferred; (B) Offline Conversion Import via CSV with `gclid` — fallback; (C) Enhanced Conversions for Leads via API — overkill. Prerequisite when ads start: verify Zite captures `gclid` + `fbclid` URL params, not just UTMs. Once Zite moves to `event.twistedpin.com`, conversion pixel injection becomes easier.
- **2026-05-12 — CTA hoist + Web Analytics + Clarity shipped in worktree (not yet merged).** `src/lib/links.ts` exports `PLAN_EVENT_URL`. 19 .astro files refactored. `<Analytics />` + Clarity inline script in `Base.astro`. Build passes; runtime verified.
- **2026-05-12 — GSC drilldown audit → 18 vercel.json redirects added.** Pulled URL-level data from GSC for Page-with-Redirect (13), Not Found (24), Crawled-not-indexed (37), Discovered-not-indexed (5) categories. Cross-referenced against existing 52-entry vercel.json redirect map. **Added 18 new redirects** for high-value gaps: bar/tap-wall variants, family-party, wp-suite typo catch, 2 old promo blog URLs, recurring-event wildcards (bar-bingo-free + karaoke-free, base + `:rest*`), `/events/16`, and 7 why-us non-`-il` city variants → `-il` pages. **Deliberately let to 404** (low-value, Google will deindex naturally): `/wp-admin/`, `/wp-content/*`, `/feed/`, WP date archives, WP post ID URLs, hack-attempt URLs. Final vercel.json count: ~70 redirects total.
- **2026-05-12 — Subdomain enumeration complete (DNSDumpster + crt.sh).** Certificate Transparency logs are exhaustive — every cert ever issued for any twistedpin.com subdomain shows up. Only `twistedpin.com`, `www.`, `event.` (Heyflow), `menu.` (Zite) exist in CT logs. Wildcard cert issued but no specific subdomain in active use. **Conclusion: Vercel DNS record sheet is complete; no hidden subdomains to surprise us at flip.**

---

## 🌳 Worktree state — what merges to main on the trigger

Worktree `claude/peaceful-wiles-d21659`:

1. **`src/lib/links.ts`** — new file (PLAN_EVENT_URL constant module)
2. **19 .astro files** — refactored to import `PLAN_EVENT_URL`
3. **`src/layouts/Base.astro`** — `<Analytics />` (Vercel) + Clarity inline script (`wq8e536e4r`)
4. **`package.json` / `package-lock.json`** — `@vercel/analytics` dependency
5. **`vercel.json`** — 18 additional 308 redirects from GSC drilldown audit (bar-grill / beer-wall variants / why-us non-`-il` cities / recurring-event wildcards / 2 old promo URLs / wp-suite typo catch)
6. **`Context/launch-cutover-runbook.md`** — this file

**Still needed before merge:**
- Update `astro.config.mjs` `site:` from staging URL → `https://www.twistedpin.com`

**Merge plan:** one commit, push to main, Vercel auto-deploys ~90s later. Do this BEFORE Phase 2 (Vercel DNS populate) so the deployed site already has correct canonical URLs in its sitemap by the time DNS points at it.

**Total redirects in `vercel.json` after this merge: ~70 entries** (52 original + 18 new). Comprehensive coverage of legacy URLs from the dev-company-era WordPress site.

---

## ⏱️ Realistic timing estimate

| Phase | Time | Note |
|---|---|---|
| Phase 0 outstanding audits | 20 min | Subdomain scan + email senders + GSC URL audit |
| Phase 1 — pre-launch work | 30-45 min | Includes merge authorization, env vars, smoke test |
| Phase 2 — Vercel DNS populate | 15-25 min | DKIM key is the fiddly part |
| Phase 3 — flip nameservers | 2 min | One setting change |
| DNS propagation (for YOU on mobile) | 5-30 min | Usually closer to 5 |
| Vercel cert provisioning | 1-5 min | Parallel with DNS |
| Phase 4 — verify | 10-15 min | The email headers test is the only one that matters |
| **TOTAL flip-night session** | **~60-90 min** | Plan for 90, expect to use 60 |
| Phase 6 — next-day cleanup | 30-45 min | Done in the morning |
| Phase 7 — Week 1-2 setup | ~30 min spread over days | Bing + UptimeRobot + privacy update |
