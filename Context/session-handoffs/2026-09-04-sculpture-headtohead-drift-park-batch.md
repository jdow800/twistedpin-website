# 2026-09-04 — Sculpture head-to-head, the drift park, batch prep bottles

**Read this before touching the liquor variance grade, the pre-submit check, the
order-guide chain, or anything named `batch`.** Written as a troubleshooting
map, not a changelog: symptom first, cause second.

---

## The one-paragraph version

Jon asked whether our system could replace Sculpture. The first clean 14-day
head-to-head said yes on the inputs (count within **0.8%**, POS attribution
within **0.6%**) but our grade read 88.5% to their 96.1%. The entire gap was 18
bottles that sold nothing and moved exactly one or two tenths of a bottle — the
counter's eye, not a pour. Parking that noise, then naming the swaps it had been
burying, moved the same period to **95.8%** against their 96.1. Jon's decision:
cancel Sculpture; if anomalies show up we triage them ourselves. Then six
follow-on items shipped, the largest being batch prep bottles.

---

## Numbers of record (Aug 21 → Sep 4, session `99f07209`, report `e48b8f84`)

| | ours | Sculpture (liquor) |
|---|--:|--:|
| on-hand oz (106 matched items) | 12,209 | 12,117 |
| sold oz | 618.3 | 622.3 |
| used oz | 685.1 | 635.7 |
| grade, before today's work | 87.7% (C) | 96.1% |
| grade, after | **95.8% (B)** | 96.1% |
| net missing | $67.43 → ~$0 | −$19.60 |

The residual ~0.3 points is **our 1.5× class `ATTRIBUTION_CAP`, which Sculpture
does not have.** Without it we would score ABOVE them. Sitting just under is
correct by construction — do not "fix" it.

⚠ The 95.8 was computed WITHOUT the trailing-persistence map (see drift park
below), so the real emailed grade may land slightly lower if any bottle shows
persistent drift. That is the feature working.

---

## Symptom → where to look

| Symptom | Cause / file |
|---|---|
| Grade looks too generous; a real loss seems hidden | `bar/variance-grading.ts` drift park. Parked lines are LISTED under "Count drift", never hidden. Past `DRIFT_MAX_BOTTLE` (0.2) nothing parks. |
| A tenth-of-a-bottle tick is still being graded | It has a **mirrored sibling** in the same class (park yields to swaps), or trailing unsold movement exceeded `DRIFT_PERSIST_MAX_BOTTLE` (0.3) → graded, flagged persistent, amber block in the email. |
| Two bottles of one brand off in opposite directions, not named | `SWAP_PAIR_MIN_OZ` = 5. Below that they do not pair. |
| A class reads 200%+ | An over-attributing class. The 1.5× cap limits its contribution to the overall grade but the CLASS row still shows the raw ratio. |
| Order guide didn't send | Chain is finalize → `BAR_VELOCITY_FEED_WEBHOOK_URL` → feeder appends → `Run Order Guide` hop. Check the feeder's executions: an append-then-hop, or a stop at "New window?" (dedup = already in the sheet). Saturday cron is DISABLED on purpose. |
| Order guide shows stale "Last Audit" | The feeder only appends a window absent from the sheet. If the report never finalized, nothing appends. |
| A consumable (Fever-Tree / Owen's / Red Bull) has no velocity | It emits a row only if it has an END count. Red Bull + Boylan are in the count grid; the GM walks past them. Not a code gap. |
| Batch liquor still reading as loss | `bar/batch-expansion.ts` refuses to expand unless **BOTH** bracket sessions carry batch rows. One end missing = no expansion at all, silently. |
| A can shows "251 ml" or lost its 🥤/🐂 marker | `CountLiquor.tsx` gates on `trackingMode === "stock_count"`, NOT `sizeMl == null`. If someone reverts that, sizes on the cans break the marker. |
| Finalize takes ~a minute | Expected. The drift-persistence window adds a third GoTab pull; the ≥30-day anchor currently lands on the Jul 24 baseline = a 42-day pull. Fine in the background sweep (awaited, no overlap). The MANUAL finalize endpoint could time out — a time budget mirroring the precheck's 15s one is the fix if that ever bites. |

---

## What shipped

**tprs** (all merged to main, deployed):

| PR | What |
|---|---|
| #154 | Unsold **drift park** + trailing persistence safeguard |
| #156 | Consumables ride the velocity feed; **finalize POSTs the feeder** |
| #157 | Drift boundary tolerance (`+0.01` btl for tenth-of-an-ounce storage) |
| #158 | `SWAP_PAIR_MIN_OZ` 10→5, **park yields to a mirrored sibling**, beer nudge |
| #159 | **Batch prep bottles** — migration `0164`, schema, expansion, endpoints |
| #160 | Pre-submit nudge when the batch shelf went unwalked |

**Website** (main): `9e4498d` count-UI re-key · `bd591f0` beer nudge copy ·
`e3e622a` batch entry section · `5698200` one-tap "no batch bottles"

**n8n** — rollback targets:
- `TP Bar — Velocity Feeder` `rxNSFrXZhqJPMrtQ` → version `bfcb1da8` (added a
  webhook trigger `POST /webhook/bar-variance-finalized` + `Run Order Guide`)
- `TP Order Guide — Weekly` `ZL7izYzOie_-1yt_-GKqO` → `953dc341` (exec trigger),
  then `60ace5bd` (Saturday cron node DISABLED)

**Render:** `BAR_VELOCITY_FEED_WEBHOOK_URL` on `tprs`.

**Prod data (SQL, no migration):** category on Bitter Truth→Liqueur,
Hendrick's→Gin, Risata→Wine. `size_ml` on consumables: Owen's ×2 = 251, Red Bull
8.4oz family = 248, Red Bull 12oz + Boylan = 355, Fever-Tree 5oz = 150, 16.9oz =
500. Luxardo Cherries deliberately left NULL (400g has no oz meaning).

---

## Traps that cost time today

1. **`String.replace` eats `$$`.** A doubled dollar in the REPLACEMENT string is
   an escape, which silently turned a SQL `DO $$` block into `DO $`. Use a
   function replacement, or a named tag: `DO $seed$`.
2. **Deleting a stacked PR's base branch auto-closes the child** and you cannot
   retarget a closed PR. Rebase onto main and open a fresh one.
3. **Astro's build does not typecheck.** `npm run build` strips types via
   esbuild; the Website has no `@astrojs/check`. To actually typecheck, run
   tprs's tsc against the file (`node <tprs>/node_modules/.pnpm/typescript@*/…/tsc
   --noEmit --jsx react-jsx --moduleResolution bundler …`). Two pre-existing
   errors are expected: `import.meta.env` and `useRecorderDictation.ts:152`.
4. **The local Website build always ends in `EPERM … symlink`** in the Vercel
   adapter's post-build hook. That is Windows, not your code — the client build
   above it says "Completed".
5. **`gh pr merge --auto` is refused** on this repo (auto-merge not enabled).
   Use `gh pr checks <n> --watch` then a plain merge.
6. **The n8n MCP partial update rejects `TP Order Guide — Weekly`** (stored
   settings carry keys its write schema refuses). Use a full PUT with
   `sanitizeSettings` from `Marketing Avery/brain/deploy/lib.mjs`.
7. **Auto-finalize is 3h**, swept every 30s inside the invoice-extraction worker
   loop. A draft freezes on its own schedule whether or not your fix has shipped.
8. **An n8n Execute Workflow node fires ONCE PER ITEM.** The first real run of
   the finalize chain wired `Append to Velocity Sheet` (113 rows out) straight
   into `Run Order Guide`, so the guide ran 113 times, hammered the GAS endpoint
   past its concurrency limit, and Jon got ~112 "[Pricing Engine] order-guide
   failed" emails plus exactly ONE correct guide. Fixed with a Limit(1) node
   named "Only once (113 rows in, 1 call out)" between them. **Never wire a
   fan-out output into an Execute Workflow / HTTP node without collapsing it
   first.** The parent execution reported success the whole time — a chain
   that looks green while doing the wrong thing, the second one today.

---

## Invariants — do not break these

- **Both-ends gate lives in `batchBottleEquivalents`, not the call sites.** It
  takes the whole bracket and returns NOTHING unless every session has batch
  rows. Crediting one end double-corrects. This is why the first period after
  0164 is a baseline by construction.
- **A ZERO batch row means "I looked, none". An ABSENT row means "nobody
  looked".** Different meanings. The UI input starts blank so only a touch
  commits an answer.
- **Batch counts are NOT extra `bar_count_line` rows** — that table is
  `UNIQUE(session, zone, sku)`. Expansion is a read-time merge.
- **The precheck must bracket exactly like the variance worker.** Both now apply
  batch expansion. A check that brackets differently clears a session the report
  then flags.
- **The velocity export reads raw `used_oz`** — the drift park never touches
  ordering.
- **The 0164 seed asserts all ten component names resolve or none do.** A
  partial match RAISES and fails the Render pre-deploy, on purpose.

---

## Open / watch

- ~~Untested link~~ **FIRED at 3:21pm.** Grade email: B, 96.5%, net −$3.98 (a
  surplus), 16 drift rows, 4 swaps — slightly ABOVE the 95.8 preview because the
  real run had the trailing-persistence map. Order guide landed 3:23pm with Last
  Audit 9/4: DJ Reposado 2.09wk, Baileys 2.22wk (<1 btl), Tanqueray 2.74wk,
  Bitter Truth on the bottle floor. Its 56-day burn agrees with the 42-day read
  given to Jon earlier (DJ Repo + Tanqueray tight, DJ Blanco next). See trap 8
  for what ELSE that run did. The Limit(1) fix is validated but cannot be
  exercised until the next count (dedup blocks the hop on a re-run).
- **First real batch count** — nothing credits until the SECOND one.
- **First time the GM sees the two nudges** (beer + batch, possibly on the same
  submit). Jon: *"lets see what he thinks of it first time he hits it."* If it
  reads as nagging, the beer one is the easier concession — beer self-corrects
  next count, an unwalked batch shelf is permanently un-inferable.
- **Training, not code:** batch section (enter a number, including 0), beer on
  the keg screen, Red Bull + Boylan.
- **Sculpture cancellation** is an ops action.
- **NOT built, deliberately:** spot-recount mode (a random-dozen blind recount);
  archiving the dead `TP Sculpture Audit Ingest` workflow.
