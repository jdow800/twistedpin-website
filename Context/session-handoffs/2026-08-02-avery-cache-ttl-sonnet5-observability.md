# 2026-08-02/03 — Avery cost pass: 1h KB cache TTL (WF1+WF2), Sonnet 5 migration, standing cache observability

**Read this before touching Avery's cache_control fields, WF7's pricing maps, or re-running cache economics.** Cross-repo: Marketing Avery (live n8n WF1/WF2/WF5/WF7 + Test Driver) + this repo (memory only). All changes LIVE; Marketing Avery commits through `42a64e1`.

## What shipped (all verified live, multi-agent audited)

1. **WF2 KB cache → 1h TTL, both channels** (was SMS-only 5-min). Deployed via the brain pipeline, golden 9/9, versionId `5eaa1854`. Basis: twice-independently-verified replay of 368 live calls — 82.6% vs ~62% hit rate, 64 vs 140 cold writes, ~$14/mo. **Hour-of-day windowed caching was simulated and REJECTED** (every window loses to always-on; orphan-write ceiling ~$6/mo — overnight already costs nothing because no calls = no writes).
2. **WF1 KB cache RE-ADDED at 1h** (2026-08-03) — WF1 had NO caching (removed 6/12 on measured basis: 3 hits/87 calls). That finding still holds inquiry-to-inquiry (median 76-min gap, 45.5% own hit rate, below ~53% break-even) — but **48 WF2 calls/30d are warmed only by a preceding WF1 write** (an inquiry opens a conversation; its replies follow within the hour). Net ≈ **+$26/mo**. The WF1 write is a prepayment for its own conversation's next turns. Applied via MCP patchNodeField ($-free replacements), validated, byte-verified.
3. **Sonnet 4.6 → Sonnet 5**: WF5's PE/FL/AR builders + Test Driver's persona branch. Each swap paired with `thinking:{type:'disabled'}` in the SAME edit (Sonnet 5 runs adaptive thinking when the param is omitted — the WF1-exec-8701 empty-reply class) + Test Driver's `temperature:0.7` removed (400 on Sonnet 5; persona variety now rides the prompt — if personas read same-y, add a variance instruction, never re-add temperature). Intro pricing $2/$10 through 8/31, then $3/$15 (= 4.6). HC path confirmed template-only (no Claude node) since 7/19. **+8/3: the Visit Feedback workflow (`TtRzMtdpMR6dsfw4`, day-after lane-booking check-in) was a MISSED 4.6 surface — it lives outside WF5.** Migrated same treatment (sonnet-5 + thinking disabled; its `max_tokens: 200` made the thinking guard critical), byte-verified. Repo grep confirms no live 4.6 remains anywhere. Its smoke test = the next daily VF tick (~11am CT) producing a normal ≤160-char check-in.
4. **WF7**: Opus cacheWrite repriced 6.25→$10/MTok (1h tier; WF1/WF2 aggregates + the new branch; WF5's opus entry deliberately left — prices zero rows). **NEW daily `Cache_Efficiency` Sheets tab** (gid 1636309343): per-day hit rate, read share, actual cost, no-cache counterfactual, `realized_savings_usd`. First rows told the story: 8/1 (5m era) = NEGATIVE savings −$2.94; 8/2 = +$0.58. Fed by a new full-day Postgres read (the 2h windowed read can't build day rows).
5. **Analysis kit committed**: `Marketing Avery/brain/analysis/` — `cache-ttl-sim.js` (reproduces all verified numbers), `export-metrics.sql` (5 queries incl. the WF1 warm-chain pair), `README.md` (baselines, decision of record, when-to-re-run triggers, 3-place price sync map).

## Verified baseline (window 5/16–6/12, KB ≈ 59–68K tokens)

no-cache **$121.74/mo** · status-quo-then **$66.15** · 5m-all **$65.44** · **1h-all $52.40** (82.6% hit). Sim anchors: 1h-all $46.97 / 5m-all $58.65 window cost — a kit change that stops reproducing these is wrong.

## Also discovered / corrected en route

- **Brain telemetry was never broken** — it moved to Postgres `avery_metrics_buffer` (Supabase twistedpin-platform) on 5/18 (WF1) + 6/12 (WF2, the TPRS-Decision-#4 coordinated flip that never got a changelog entry — now reconstructed in WF2.changelog.md). **The Google Sheet Metrics_Buffer tab is WF5-only** and reads exactly like breakage. Any brain-call analysis queries Postgres.
- The 6/12 SMS-only WF2 cache decision was reasoning-only (code comment, no measured basis, no changelog entry); the 6/12 WF1 removal WAS measured and correct for its regime.

## Watch items

- **Mon 8/3 ~11am CT**: WF5 cron tick = Sonnet 5 smoke test (normal PE/FL/AR copy + `model=claude-sonnet-5` in metrics rows).
- **Cache_Efficiency tab** (updates at 3:30/9:30 am/pm CT): hit rate should climb toward 70–80%+ and savings go solidly positive as the 1h flip beds in. WF1-specific hit rate via export-metrics.sql query 3 (was 0.0%).
- **Jon's ~1-month cache re-check (early Sep)**: run export-metrics.sql queries 3–5 + the sim per the kit README. Coincides with Sonnet 5 intro pricing lapsing 9/1 (WF7 already prices at list — no change needed).
- **Before Aug 30**: golden case `tiffany-multiquote-offer-beat` date-bump (pre-existing obligation; it also sampling-flaked once this session, blocking the first deploy attempt).
- Pre-existing WF7 quirk (untouched): cron fires 4×/day but the hourly read window is 2h → hourly WF1/WF2/WF5 tabs undercount; the new day branch is immune. Follow-up decision owed.
- `wf1_work/` local snapshots remain STALE (pre-Opus-5) — trust live, not those files.

## Batch API + model downgrades: assessed and REJECTED this session

Batch (50% off) doesn't fit: guest-facing calls are latency-sensitive; templated follow-ups never hit Claude; WF5's Claude volume is pennies. Don't revisit without a new non-urgent high-volume LLM workload. Keep the brain on Opus 5 — caching made input cost mostly moot.

Memory: [[avery-kb-cache-ttl-analysis]], [[avery-metrics-buffer-postgres]].
