# 2026-09-01 — Event Builder: first end-to-end Send, crossroads reply, WF2 hardening, congruence audit (handoff)

**Read this first tomorrow.** The previous session crashed mid-test; this one reconstructed it, shipped a lot, and ended with Jon closing for the night. Everything below is committed and pushed in `Marketing Avery` (HEAD `ae75d46`) and `Website` (HEAD after this file). Repos: `C:\Users\jdow8\dev\Marketing Avery` (Avery brain/n8n), `Website` (estimate proxy + docs), `tprs` (read-only tonight).

## State at close (verified live)

| Thing | State |
|---|---|
| `Avery — Builder Submit` (`bbIbkgJegEqz5x3P`) | **DISARMED** (inactive) — re-arm for a test with `node brain/deploy/test-builder-send.mjs --arm --no-post --eid E-0068352`; test link `https://menu.twistedpin.com/b/es/E-0068352` |
| WF2 (`dYG_0_MVmIpS_EQCBZ-Tl`) | active, versionId `372146f7` (tonight: `57ce1e1d → e536660d → 164ca2aa → b4f88557 → ee46bf0c → 42d384d8 → 372146f7`), drift-check CLEAN |
| WF1 | untouched tonight |
| Live KB Doc | untouched tonight. Rewrite target = `brain/kb/Avery_KB_builder-draft.md` (byte copy) |
| Website `/api/estimate/menu/` | now returns `rules: {vip_3h_floor:49, trad_only_floor:60, vip_ceiling:80}` (Zite reads it; values unchanged) |
| Zite | v3 plan approved + built (pizza removed, tp-well, rules-from-API, typeable steppers, "Send to Twisted Pin", submitted_by gone). Owed back: fix-list 2–10 status + photos, Phase-2 verification captures (visitor path NEVER run) |
| Golden suite | **retired as a gate (Jon 9/1)** — all deploys use `--skip-golden`; make it default on `deploy-kb.mjs` too |

## What shipped tonight (all staged on a WF2 clone first via `brain/deploy/stage-on-clone.mjs`)

1. Builder-turn crash fixes: retry path (`Build Retry Request`) and `quote_confirmation_skipped` builder-aware; 5 plumbing guards (`patch-wf2-menu-path-guards.mjs`). Audit tool `audit-menu-path.mjs` (58 inbound-only refs reachable from the menu webhook; 9 guarded).
2. Quote params PINNED to the submission on builder turns (the page said $2,450, Avery quoted $2,285 — 11 arcade cards lost to bare slugs). Pin moved ABOVE the delivery-plan auto-fix at 00:40 (audit finding).
3. **First builder Send completed end to end** (WF2 exec 24841, 6:12→6:20pm CT). Dedupe absorbed a double-press.
4. Crossroads reply (`patch-wf2-builder-crossroads-render.mjs`, snippet `brain/deploy/snippets/format-quote-builder-crossroads.js`): Avery's one-sentence personalized opener + fixed "Your total came in at about $X ($Y deposit). Any questions for me? If you're ready, I can send the deposit link over - heads up, they're valid for 48 hours." No refundable line, no "how does that sound", no upsell; email variant with compact recap; short-lead total-only. Preface budget check `builder_preface_invalid` + retry entry.
5. Staff notes stacked + 12-hour (Builder Submit `dc9f844c`), quote-breakdown note 12-hour.
6. Congruence audit (Workflow `wf_0b01d930-e2f`, 44 Sonnet agents): `Marketing Avery/audit-2026-09/CONGRUENCE-REPORT.md`, `AVERY-SYSTEM-MAP.md`, cards, KB sweeps, critic.

## Rulings recorded tonight (all in `zite-event-builder-brief-2026-08-30.md` §2.2c–2.2e, §2.3a, §2.3c–2.3e and `vip-capacity-rebanding-spec-2026-09-01.md`)

- VIP bands: 2=16, 4=32, 6 lanes to **60 everyone**, **61–75 company only** (Avery closes autonomously), 76+ staff; near-miss → NA. **3 hours NEVER required**, suggested from 43. Page stays type-blind to 75; WF2 sorts at Send (non-company 61–75 built in VIP → NA directly). Spec knobs still open: 61–75 vibe-line wording; "default 3h, both offered" encoding; default lane at 61–75.
- Availability: recourse is mandatory (earlier/later/traditional); Tier 1 = day-level closures from TPRS (no Zite work); Tier 2 = slot alternatives (TPRS endpoint + WF2 ladder); page popup only after Tier 2.
- Refund = an ANSWER when asked, never announced. Headcount: **say "seven days" to guests; day 6 is internal.** Copy audit owed (KB 14 lines, WF2 2 files, WF5/FP/fundraiser templates, tprs 5 files, pay page date) — as one pass with the KB §7 rewrite. Open: does "answer not announcement" retire the 8/31 refundable line on the STANDARD quote too?
- "I just sent it" race: never "nothing on my end yet"; hold line + 10–15 min timer + NA. Collision Gate CONFIRMED to eat the builder quote when a guest texts in the 5-min window (fix with the hold).
- WF1 first touch = deliver the build link (routing questions first); form drops date + time-of-day post-widen. Big light switch: KB deploy + WF1 flip + menu-link constants + Builder Submit armed + proxy constants in one window, old links/KB kept as revert.

## Next (plan of record: `builder-rollout-review-2026-09-01.md` §6 + §6a)

1. Jon: clone the live KB Google Doc → "Avery KB — BUILDER DRAFT", same sharing, send the URL. Then: `deploy-kb.mjs` gains a target-doc option; staging clones' Fetch KB point at the draft Doc.
2. B1 guards from the audit: `Set Route` `inZone` company branch; Engagement Nudge `copy_variant` split from the company dwell exemption.
3. `Queue API Failure` webhook-agnostic + replay routing (builder-turn API failures currently die into one Gmail).
4. Collision Gate builder-awareness + the "I just sent it" hold/timer/NA (also scope WF1's zero-wait visitor fire).
5. Redacted-export tooling (WF2 revert exists only on this PC); key/PAT rotation.
6. TPRS season port (Nov 17–Apr 1 + Sunday P&P) — P0 before Nov 1 (memory `tprs-engine-season-gap`).
7. KB rewrite against the report's §2 worklist, in the draft file.

## Gotchas learned tonight (save yourself an hour)

- **The Bash tool strips backslashes and chokes on multi-line quoted heredocs** — write files with the Write/Edit tools; keep Bash for commands. (Regex literals sent via Bash arrived as `/$s?d/`.)
- `String.replace` with a replacement STRING expands `$'` — splicing code that contains `about $' +` truncated Format Quote once. Use a function replacer (`s.replace(a, () => b)`).
- The auto-mode permission classifier (Sonnet) rate-limits while a Sonnet fan-out is running; wait it out.
- On a fresh Send, wait out collision (5m) + humanize (≤9m) before declaring anything missing — the "relay is broken" scare was a timing artifact.
- Zite's Send is a SERVER-SIDE relay (`workflows.zite.com` → `builderSubmit`/`builderInquiry`), not a browser POST: CORS irrelevant; their runner log is the first place to look.
- `stage-on-clone.mjs` before every prod WF2 change; `audit-menu-path.mjs --evidence <execIds>` after any WF2 wiring change.
