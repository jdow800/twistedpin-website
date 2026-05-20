# 2026-05-19 — GSC fixes, full-venue capacity copy, live Google reviews, cron trailing-slash fix, + cross-repo Avery DB migration (Railway → Supabase)

**Heads-up:** this session spans two repos. The Website repo shipped 4 commits. In parallel, **Avery's Postgres data layer migrated off Railway and onto Supabase Pro**, plus the Avery n8n KB got two voice fixes. That cross-repo work is summarized here for context — most of it isn't in this repo. See §Cross-repo work below.

---

## Website-repo commits (4, all to main)

| Commit | Scope |
|---|---|
| `17b2bed` | Capacity copy site-wide: "up to 200 for full-venue buyouts" across 6 event-funnel pages + venue-level `maximumAttendeeCapacity: 200` added to `localBusinessBase()` schema. Skipped /wedding-receptions/ + /showers/ deliberately (intimate-positioning pages); both have new docstring comments explaining why. |
| `d8ee252` | **Live Google review count + rating**: extended the existing daily Places API cron (`/api/cron/rebuild/`) field mask to also pull `rating` + `userRatingCount`. Schema-level `aggregateRating` on 6 LocalBusiness pages + SnapFooter proof-card both read live values now, falling back to constants when snapshot is missing/stale. Zero additional API cost (same daily call, expanded field mask). Visual treatment in SnapFooter unchanged (only the numeric values come from variables). Verified end-to-end: snapshot committed at 17:15 UTC with `rating: 4.5, reviewCount: 1142` (up from the hardcoded 1141). |
| `ed2b215` | **GSC-flagged schema fixes**: (1) VideoObject `uploadDate` was missing timezone — now emits ISO-8601 with -06:00 offset. (2) Event schema was missing `organizer.url` (now points at MAPS_VENUE_URL) and `performer` (now `{ "@type": "Organization", "@id": BUSINESS_ENTITY_ID }`). Both issues flagged in this morning's GSC emails. |
| `6023192` | **Cron silent-failure fix**: `vercel.json` cron `path` was `/api/cron/rebuild` (no trailing slash). `astro.config.mjs` sets `trailingSlash: 'always'`, which 308-redirected every request — and Vercel Cron does NOT follow 3xx responses. Result: cron silently never fired for 5 days (2026-05-14 → 2026-05-19). Snapshot `live-hours.json` was empty `{}` the whole time; site fell back to static. One-character fix: added trailing slash. After deploy + manual trigger, cron commits succeed. |

## Ops actions completed (not code)

| Action | Outcome |
|---|---|
| GSC: Validate Fix on `/events` Review Snippets (from 2026-05-17) | Clicked validate. Awaiting Google re-crawl (3-10 days). |
| GSC: Submit `/sitemap-videos.xml` | 9 video pages discovered. |
| GSC: Validate Fix on Videos structured data (uploadDate timezone) | Pending after `ed2b215` deploys. |
| GSC: Validate Fix on Events structured data (organizer.url + performer) | Pending after `ed2b215` deploys. |
| GSC: Validate Fix on Redirect error (`/free-kids-bowling/` on apex) | Pending after Vercel apex 307 → 308 flip. |
| Google Ads: retarget Spanish Test ad group → `/es/bowl/` | Done. Bleeding ad spend stopped. |
| Vercel: apex `twistedpin.com` redirect type 307 → **308 Permanent** | Done via Vercel Domains UI. Confirmed via `curl -I` — apex now returns `308 Permanent Redirect`. The full chain `http://twistedpin.com/` → `https://twistedpin.com/` → `https://www.twistedpin.com/` is now 308-308-200 (was 308-307-200). |
| GitHub PAT: `GITHUB_TOKEN` got Contents:Read+Write scope on twistedpin-website repo | Was set to "Public repositories (read-only)" — cron's GitHub PUT was failing 403. Now writes succeed. |

## Cross-repo work (Avery + n8n KB)

These touched the Avery / Loyalty / TPRS world, not this Website repo. Captured here so future sessions know what changed elsewhere on 2026-05-19:

### Avery KB (Google Doc `1CvU6c6DbNVpd9CHGD5i8s2s1uwba_I39BsoaWVi0iIg`, v15.1)

Two voice fixes shipped via gdrive MCP `findAndReplaceInDoc` + `insertText`:

1. **Eliminated "bay" jargon entirely.** 6 occurrences replaced: `sold in bay pairs` → `sold in pairs of lanes - 2, 4 or 6`; `arranged in bays of 2 / by bay / across bays` → `arranged in pairs of 2 / by the pair / across pairs`; `bay logistics` → `lane-pair logistics`; `across bays` (in rules section) → `across pairs`. Confirmed 0 remaining "bay" occurrences in the doc.

2. **New "Opening the bar conversation" subsection** prepended to the existing Bar card conversation patterns. Frames bar introduction as an opt-in invitation ("Are you interested in adding on bar options? We have a craft cocktail program curated by America's Top Mixologist, plus a 28-tap self-serve beer and wine wall.") instead of a leading "cards or tab" choice that presupposed drinking.

### Avery n8n WF2 (workflow `dYG_0_MVmIpS_EQCBZ-Tl`, "Avery — Inbound Message Handler WF2 - REBUILT")

Patched the `Create Cold Inbound Event` Code node via `n8n_update_partial_workflow`:
- Was: `const contactId = require('crypto').randomUUID();`
- Now: `const contactId = crypto.randomUUID();` (no require — Web Crypto API global is exposed in n8n's sandbox even though `require('crypto')` is blocked)

Active version `26a18c51-03ac-4645-bb34-348b61ec195b` published 2026-05-19 19:46 UTC. Test SMS at 01:21 UTC confirmed the fix works end-to-end.

### Avery database — migrated Railway → Supabase Pro

**Driving event:** Railway had a major outage today (2026-05-19) — Google Cloud blocked Railway's account at 22:29 UTC. Whole platform degraded. Earlier in the day n8n was already hitting frequent ECONNRESETs against Railway Postgres (TCP idle-timeout class issue — Railway has no pooler in front of Postgres, n8n's Postgres node doesn't validate pooled connections before reuse).

**What landed:**

1. **New Supabase Pro project** `twistedpin-platform` (id `hdcoyqlskurvpjfrlnop`, us-east-1, Postgres 17.6.1). Signed up via Vercel marketplace → billing flows through Vercel invoice.

2. **Canonical schema applied** from `Loyalty/db/002-post-amendment-schema.sql` (the post-amendment-ratification design input dated 2026-05-19 that supersedes 001). 10 tables + 5 enums + 3 service-account User seeds + Jon Dow as customer #1.

3. **Schema organization confirmed**: public-schema-with-prefixes (per ADR-0012 amendment 2026-05-17 / commit `fdef856`), NOT separate Postgres schemas. Avery tables are `avery_event`, `avery_campaign_log`, etc. in `public`. Earlier created `avery`/`loyalty`/`tprs` Postgres schemas dropped via cleanup migration.

4. **n8n Postgres credential** (`tp-railway-postgres`) repointed at Supabase pooler:
   - Host: `aws-1-us-east-1.pooler.supabase.com`
   - Port: `6543` (Transaction pooler)
   - User: `postgres.hdcoyqlskurvpjfrlnop`
   - SSL: Require, **"Ignore SSL Issues" must be ON** (n8n's Node.js can't walk Supabase's cert chain — standard workaround, not a real security issue, traffic still encrypted)
   - Max Connections: 1

5. **End-to-end verified**: test SMS at 01:21 UTC → WF2 fired → `avery_event E-9009780` written with FK to customer table → `status: gathering_info` → no ECONNRESET. **Database stability problem solved.**

**Still pending (next session):**

- Loyalty DB migration (task #19)
- TPRS DB migration + ADR-12b amendment (task #20) — TPRS agent will write the amendment when this lands
- Verify remaining Avery workflows (WF1, WF3-7, EN) write cleanly (task #21)
- Decommission Railway Postgres after 24-48h Avery stability (task #22)
- TPRS backend hosting decision (separate from DB) — deferred to ~2 weeks pre-launch per agent recommendation; if it moves, Render is the recommended target (NOT Vercel — serverless mismatch for TPRS's continuous outbox publisher workers; NOT Fly because Render's mental model is the smoother continuation of what's already known)

## Two lessons memorialized

Added to `~/.claude/projects/.../memory/` for next session(s):

- **`feedback_psi_cold_edge.md`** (from earlier today): first PSI run on a freshly-deployed Vercel page lands 1.5-2s slower than steady-state because the edge cache is cold. Always re-run before designing a fix. Caught us mid-investigation when /corporate-events looked like it had a real LCP problem (4.5s) but warm re-run showed 2.9s/perf 88.

- **New today** (verbal, not yet memorialized — worth adding): **Railway Postgres + n8n's Postgres node = chronic stale-connection roulette.** Railway has no pooler in front of Postgres; external clients connect directly; Railway's edge proxy silently kills idle TCP connections. n8n caches connections in a pool and doesn't validate them before reuse. When Railway drops the socket, n8n only notices when it sends a query — TCP timeout takes up to 60s to surface as ECONNRESET. The fix is structural (move to a host with a managed pooler like Supabase / Neon, OR run n8n same-network as Railway Postgres), not configurational.

- **New today: Vercel Cron + Astro `trailingSlash: 'always'`** — Vercel Cron does NOT follow 3xx redirects. If your cron path in `vercel.json` doesn't include the trailing slash, Astro's URL normalization 308-redirects the request and the cron silently never fires. Symptom: zero log entries in Vercel for the cron path. The trailing slash on the cron path is load-bearing.

## Working preferences calibrated this session

- **User wants honest infrastructure trade-offs, not vendor sales pitches.** When recommending Supabase over Neon, walked through actual axes (PostgREST built-in vs BYO, scale-to-zero relevance vs continuous polling workloads, pooler architecture) rather than "this one is just better."
- **User trusts agent cross-coordination.** The TPRS agent's analysis of the Railway → Supabase decision was treated as authoritative on TPRS-side architectural concerns (Drizzle portability, ADR-12b amendment scope, backend hosting question). Cross-agent verification (TPRS agent confirming public-schema-with-prefixes alignment) carried weight.
- **User accepts "decision deferred" as a valid answer.** TPRS backend hosting question wasn't forced — explicitly parked until ~2 weeks pre-launch. The pattern is: decide DB host now (concrete reliability problem), decide backend host later (no immediate forcing function).
- **User pushes back on premature optimization.** "What's the concern that we're writing into the database at the exact same time from multiple angles? I feel like that would happen one out of every billion times." Resulted in Single-Supabase-project-with-schemas decision instead of three separate projects (~$50/mo savings).

## Next session entry point

Next session can pick up from any of these threads:

1. **Avery follow-through** — verify remaining workflows (WF1, WF3-7, EN) write to Supabase cleanly. Look for any missing `created_by_actor_id` on writes (Amendment 17 NOT NULL discipline) or schema-mismatch column references.

2. **Loyalty migration** — apply schema-impl slice when ready; same migration pattern as Avery (Supabase project already provisioned, just need Loyalty's tables).

3. **TPRS migration + ADR-12b amendment** — TPRS agent offered to write the amendment in scope of "DB vendor swap only, backend hosting question explicitly OPEN."

4. **Railway decommission** — after 24-48h of Avery stability on Supabase, delete the Railway Postgres service. Saves ~$5/mo.

5. **Website work** — backlog: responsive video poster variants (task #3, 21-36 KiB savings per pillar page, low urgency), dynamic content widgets ("this week's events" teaser), pillar CSS hoist refactor. All deferred — none urgent.

The four GSC validations should resolve in 3-10 days naturally. No follow-up needed unless validation fails (would email).
