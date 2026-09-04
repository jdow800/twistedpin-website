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
| A consumable (Fever-Tree / Owen's / Red Bull) has no velocity | It emits a row only if it has an END count. Red Bull + Boylan are in the count grid; the GM walks past them. Since the evening: once an invoice for it lands in a period, the precheck's `purchased_not_counted` asks for the count at submit (tprs #162). Before any invoice, still silent by design. |
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

---

## Late afternoon — the guide checked against Sculpture's inteliPar (Jon: "hey order these type vibes")

**Verdict: directionally right and more conservative than theirs** (their whole
guide was "order one Baileys"; ours called Don Julio Reposado / Baileys /
Tanqueray, with DJ Blanco, Casamigos Repo, Prosecco agreeing on the could-add
band). Two rows were wrong, both traced to data, not the engine:

| Row | What the guide said | Truth | Cause |
|---|---|---|---|
| Ginger Beer (family) | ORDER NOW, 2.32 wk | ~5 wk (Owen's only) | Phantom: Fever-Tree 5oz counted 72 on 8/21 AND 9/4, but its 72-can invoice (dated 8/08) was uploaded by the mail crawler's 8/21 BACKFILL *after* the 8/21 count was submitted, so `start + purchased − end` read 72 used. Consumable rows started today, so there was no history to average it out. **Fixed by hand: velocity sheet row 5055 col J (used_oz) 365.2 → 0.** Live GAS re-fetch: family no longer flagged. No code change — the crawler now uploads next-day, so the window can't skew like that again. |
| Ron Zacapa 23 | absent | ~4.5–5 wk → should be could-add | A bottle appeared between 8/07 (1.6) and 8/17 (2.1) with NO invoice in the system → that window read negative use → 56-day trailing burn ~7 wk. Sculpture had it at 29 days and as their #1 loss line. Jon told: add one to the Breakthru order. |

**Successor inheritance (Code.gs, Jon's ask: "stop alerting on El Jimador, run
it to 0, alert off Jose's velocity, which should inherit El Jimador's").**
`REPLACEMENTS` entries gain an optional `successor` (substring of the
successor's velocity-sheet name). New `mergeReplacedRows_` runs inside
`loadVelocity_`: once the successor has ANY velocity row, the replaced SKU's
rows are re-tagged as the successor's and merged per window (on_hand + used
summed, successor's size/vendor/cost) — the old bottle vanishes from every list
and the successor plans on the family's history plus the old bottle still on
the shelf. Before the successor is counted, behavior is unchanged ("order X
instead"). Defaults: El Jimador → Jose Cuervo Tradicional; Owen's Tonic →
Fever-Tree Tonic 5oz; Owen's Ginger Beer → Fever-Tree Ginger Beer 5oz (Jon:
converting to Fever-Tree). Smoke test: `06-engine/tests/successor-inheritance.test.mjs`
(11 green). **⚠ Code.gs deploy is MANUAL — Jon pastes
`Alcohol Pricing/Twisted Pin Bar Hub/06-engine/Code.gs` (now ~1084 lines) into
`BAR - TP Pricing Calc - BAR` + Deploy → New version. NOT the
`gas-pricing-engine/Code.gs` decoy.** Until pasted, El Jimador keeps showing
in could-add with the "order Jose instead" line.

**New SKU (prod):** `Fever-Tree Tonic Water 5oz Can` (`c6da0894`, WebstaurantStore,
150 ml, stock_count, 24/cs, $0.85, alias carries the invoice line text
"Fever-Tree Premium Tonic Water Can 5 fl. oz." + item # 103FVRTONIC) so the
crawler's invoice matches and the count grid shows it. WebstaurantStore
emails ARE scraped (API-key ingest since 8/21; Jon was right).

**Trap 9 — a backfilled invoice lands in the NEXT window.** Purchase windows
close at `submitted_at`. Anything uploaded after a count is submitted credits
the following period, which is correct for scan-lag but wrong for a backfill
of a delivery the count already saw. Symptom: a consumable with one row of
history showing used == purchased. Fix is the cell, not the code.

**Paste #1 landed (Jon, ~5pm) and exposed trap 10 — then a SECOND paste is
owed.** Live re-fetch after the paste: El Jimador gone from could-add (correct)
but **Maschio Prosecco moved 5.61 → 4.55 wk with no data change** (audits 61 →
50, days 595 → 483). Cause: the first-cut merge re-keyed EVERY sheet row by
(sku, audit_end) and SUMMED collisions. The 8/22 rename reunified families
that had two rows per audit, and `computeWoS_` already handles those
(used and days both summed = same burn); collapsing them keeps used but
maxes days → burn inflates. **Fixed: the merge now folds only MOVED rows into
the successor's own same-window row and touches nothing else; two original
rows are never summed.** Test gained three regression cases (14 green).
**⚠ Jon must paste Code.gs AGAIN (~1089 lines).** Until then Prosecco and
any other double-row SKU read slightly hot.

**Trap 10 — never "normalize" the whole velocity sheet inside a feature.**
Duplicate rows per window are a known, handled shape. A merge that is meant
for one family must be scoped to that family's rows.

**Wk Burn column on COULD ADD (Jon: "helps me figure out how much").**
`Format Email` in `TP Order Guide — Weekly` renders the planning burn (oz/wk
+ btl/wk) in the ride-along table too, same recipe as ORDER NOW. Deployed via
`patch-guide-could-burn.mjs` (sanitized full PUT; offline render check
against the live payload first, 9 burn cells = 9 rows). Rollback: versionId
`60ace5bd` → `5387efba`.

---

## Evening — Boylan tracked, `purchased_not_counted`, Prosecco vendor, the 9/9 cart

- **Boylan Black Cherry is now a WebstaurantStore item** (Jon; portal item 103BK0125,
  12 oz, 24/cs, $37.49 → $1.56/btl; last bought there Jun 21). bar_sku: vendor,
  cost, 24/cs, aliases carrying the invoice line text. It was the only Boylan and
  the only Heartland SKU; zero Heartland invoices and ZERO count lines ever — every
  Boylan number the guide showed was Sculpture history (their 34 vs our 14 = an
  unrecorded delivery). Its Sculpture rows are in UNITS, ours will be OUNCES;
  the first count's row reads negative (no prior) and the 56-day window flushes
  the old rows by late October. Not worth a 40-row sheet edit.
- **New precheck finding `purchased_not_counted` (tprs #162, Website `1004c46`):**
  never counted before + in-window purchase + no line this session. The
  never-counted gate had this exact shape silent (first_count needs a line).
  The invoice gives it standing; no invoice = still silent. This is the
  mechanism by which "start tracking X" actually happens: order it, the crawler
  books the invoice, the GM's next submit asks for the count. Fires for Boylan
  and the Fever-Tree tonic on their first delivery. **#162 merged with "no
  checks reported" — typecheck green locally, vitest not run on it.**
- **Maschio Prosecco → Breakthru** (reverses 8/22). The June invoice was
  genuinely Southern; Jon buys it from Breakthru now at the same $2.50 deal.
  bar_sku + sheet row 5090 col F patched, live engine confirms. Side-find:
  bar_vendor has two Southern rows ("SOUTHERN GLAZER'S OF IL" from invoice
  text + the canonical one). Not fixed.
- **Cart review (Breakthru, delivers 9/9):** every line matched the burn data
  except **Captain Morgan at 3 cases = 56–117 weeks** (one case advised; check
  whether Diageo "Mix and Match" lets the DJ cases hit the tier). **Two size
  mismatches**: cart has Captain 750 (we count a 1L) and Tanqueray 1L (we
  count a 750) — Jon to switch sizes or ask for new-size SKUs before 9/9,
  else the next count misreads those bottles by a third. Bartender's list
  scored 4 right / 7 not needed / 4 missed (Baileys, Casamigos Repo, Zacapa,
  Prosecco).
- Burn answers given: DJ Blanco 10.5 oz/wk planning (0.31 btl), Casamigos
  Repo 19.7 oz/wk (0.58 btl, 2× its lifetime).

---

## QA pass (end of day) — two reviewers over every diff + live infra checks

**Infra: clean.** Render live, /health 200, only errors in 5h = the Stripe
webhook's designed retry race (both payments settled seconds later). Ledger
164 = journal 164. Both batches seeded (5 components each), 0 batch counts
(expected). n8n feeder + guide validate clean, Limit node wired, Saturday cron
off, exec trigger wired. Sheet cells J5055=0 and F5090=Southern read back.
Finalize log line matches the email (16 parked / 0 persistent / 96.5%).

**Confirmed and FIXED:**
1. **`purchased_not_counted` fired per beer brand (tprs #164).** Beer lives only
   in keg-check partial sessions, so in a full count its start is always null;
   any beer invoice in the period tripped the finding per brand with a false
   "never counted", and the remedy (a line in the full count) would satisfy
   the `beer_not_counted` gate and silence the nudge that is right. Now
   skips `beverage_class='beer'`. Reachable in prod (168 units, 3 brands,
   invoiced 9/3) — it didn't fire today only because that invoice fell in the
   prior bracket.
2. **Code.gs orphan-host bug.** A moved row with no successor host joined
   `kept` and then HOSTED the next moved row for the same window → two
   original replaced-SKU rows in one window summed (used doubled, +50% burn).
   Trap 10 on the other side. Hosts are now a snapshot of `kept` taken before
   the fold; test 15/15. **⚠ Third paste owed (Code.gs ~1093 lines).** Latent,
   not live: El Jimador / Owen's were never renamed, so no duplicate-window
   rows are expected for them today.
3. **Dead button (Website `c17cc9b`).** "No batch bottles" rendered even when
   the batch list failed to load, and the handler no-ops on an empty list.
   Hidden when `batches.length === 0`.

**Plausible, NOT fixed (watch list):**
- Batch entry is zone-keyed in the UI but venue-summed on the server; a
  counter re-typing the same prep bottle in a second zone doubles it. Header
  wording is the only guard. Fix if it happens once: show other zones' totals.
- Mirror-yield can un-park a tick on a walk-in FOUND line in the same class,
  and greedy pairing can leave a rescued tick graded but unpaired. Both err
  toward a LOWER grade, never inflation.
- Persistence check is silently off when counts are ≥30 days apart (anchor ==
  prior). Fail-open by design; monthly cadence never flags persistence.
- Manual finalize now runs the 30-day GoTab pull synchronously (~45-60s);
  no Fastify timeout set, Render proxy tolerance unverified. Background sweep
  is unaffected.
- Both-ends gate counts JOINED rows (active batch+component+sku); the precheck
  counts RAW `bar_batch_count` rows. A session whose only rows point at a
  later-deactivated batch passes the check but the bracket refuses to expand.
- First ~2 emails: the emailed fortnight/trailing grade gets no batch credit
  until the ANCHOR session has batch rows, while the frozen bracket does.
- `batchBottleEquivalents`' both-ends refusal has no DB test; only the pure
  expansion is tested. `PUT /counts/:id/batches` with a bad zone/batch id →
  FK 500 not 4xx.
- Code.gs: `String(audit_end)` key won't fold a Date against a string (uniform
  today); canon = latest successor row (brittle if a second "jose cuervo
  tradicional" variant appears); a Script Property `REPLACEMENTS` without
  `successor` would silently disable inheritance (SETUP.md still documents
  the 2-field shape); successor substrings are name-fragile ("5oz").
- 14 stale draft count sessions (July tests + Sept 2 partials). Harmless.
- A typed batch value > 99 fails submit with no message (server cap).
