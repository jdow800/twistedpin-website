import { useEffect, useRef, useState } from "react";
import {
  BarApiError,
  ForbiddenError,
  getCountCosts,
  getCountHistory,
  getFoodCost,
  getFoodCostList,
  rerunFoodCost,
  revalueFoodCount,
  type CountCostLine,
  type CountSummary,
  type FoodCostReportBody,
  type FoodCostSummary,
  type FoodCostVersion,
} from "../api";
import { FoodCostReportView, money, pctText } from "../FoodCostReport";
import { num, unitWord, usd } from "../FoodVarianceReport";

// Food cost, per food bracket (TPRS migration 0206; Opsi BUILD-SPEC
// 11.125-11.127): what food and NA cost between two full food counts, against
// what they sold. The first count is the baseline. A report is a draft for 3
// hours while late invoices land; its finalize freezes the counts' costs. A
// later version is written by an admin's re-run or revalue, or by TPRS itself
// when a missing piece (a Brunswick report, an invoice, a catered event)
// arrives. Trends read each bracket's latest version.

/** How long a draft settles before TPRS freezes it (workers/food-cogs.ts). */
const SETTLE_MS = 3 * 60 * 60 * 1000;

function day(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${day(iso)} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const isBaseline = (v: FoodCostVersion) => "baseline" in v.report;
const bodyOf = (v: FoodCostVersion) => (isBaseline(v) ? null : (v.report as FoodCostReportBody));

/** A version's tab: why it exists. */
export function versionLabel(v: Pick<FoodCostVersion, "version" | "trigger">): string {
  if (v.version === 1) return "Original";
  if (v.trigger === "rerun") return `Re-run · v${v.version}`;
  if (v.trigger === "revalue") return `Revalued · v${v.version}`;
  return `Updated · v${v.version}`;
}

/** What a later version says about itself. */
export function versionStatus(v: FoodCostVersion): string {
  const by = v.computedBy ? ` by ${v.computedBy}` : "";
  if (v.trigger === "rerun") return `Re-run ${when(v.createdAt)}${by}: “${v.reason}”.`;
  if (v.trigger === "revalue") return `Costs revalued ${when(v.createdAt)}${by}: “${v.reason}”. Both brackets this count bounds got a new version together.`;
  return `Updated by TPRS ${when(v.createdAt)}: ${v.reason}`;
}

interface Row {
  sessionId: string;
  at: string;
  summary: FoodCostSummary | null;
  countedBy: string | null;
}

/** Reports first, then the submitted full food counts that have none yet. */
export function foodCostRows(reports: FoodCostSummary[], counts: CountSummary[]): Row[] {
  const rows: Row[] = reports.map((r) => ({ sessionId: r.sessionId, at: r.periodEnd, summary: r, countedBy: null }));
  const byId = new Map(rows.map((r) => [r.sessionId, r]));
  for (const c of counts) {
    if (!c.isFullCount || !c.submittedAt) continue;
    const have = byId.get(c.id);
    if (have) have.countedBy = c.countedBy;
    else rows.push({ sessionId: c.id, at: c.submittedAt, summary: null, countedBy: c.countedBy });
  }
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function apiError(e: unknown): string | undefined {
  if (!(e instanceof BarApiError)) return undefined;
  try {
    return (JSON.parse(String(e.body ?? "")) as { error?: string }).error;
  } catch {
    return undefined;
  }
}

function rerunError(e: unknown): string {
  if (e instanceof ForbiddenError) return "Only an admin can re-run a report.";
  const code = apiError(e);
  if (code === "not_final") return "This report is still a draft. It locks itself; re-run it after that.";
  if (code === "baseline") return "A baseline has nothing to re-run.";
  if (code === "no_gotab") return "GoTab can't be read right now, so the sales can't be re-read. Try again later.";
  if (e instanceof BarApiError && e.status === 400) return "Say what changed (at least 3 characters).";
  return "The re-run didn't go through. Nothing changed; try again.";
}

function revalueError(e: unknown): string {
  if (e instanceof ForbiddenError) return "Only an admin can revalue a count.";
  const code = apiError(e);
  if (code === "no_gotab") return "GoTab can't be read right now, so the brackets can't be re-read. Nothing changed; try again later.";
  if (code === "unknown_line") return "The count changed under this screen. Reload and try again.";
  if (e instanceof BarApiError && e.status === 400) return "Give every price as a number, and say why (at least 3 characters).";
  return "The revalue didn't go through. Nothing changed; try again.";
}

/** What a revalue did, in words: this bracket's new version (or the draft
 *  that will pick it up), and the neighbouring bracket's. */
export function revalueMessage(
  revalued: number,
  versions: { sessionId: string; version: number }[],
  sessionId: string,
  status: "draft" | "final",
): string {
  if (revalued === 0) return "Nothing to revalue.";
  const mine = versions.filter((v) => v.sessionId === sessionId);
  const others = versions.filter((v) => v.sessionId !== sessionId);
  const parts = [`Revalued ${revalued} line${revalued === 1 ? "" : "s"}.`];
  if (mine.length) parts.push(`Version ${mine[mine.length - 1]!.version} written.`);
  else if (status === "draft") parts.push("The draft picks it up when it locks.");
  if (others.length) parts.push(`The bracket next to it got version ${others[others.length - 1]!.version}.`);
  return parts.join(" ");
}

/** One item to price on one count: every line of it there, and what TPRS suggests. */
export interface PriceItem {
  countId: string;
  end: "opening" | "closing";
  skuId: string;
  name: string;
  unit: string | null;
  qty: number;
  lineIds: string[];
  current: number | null;
  basis: CountCostLine["basis"];
  suggestion: CountCostLine["suggestion"];
  why: "unpriced" | "cost_jump";
}

/** The items a report says need a price: unpriced with quantity, or a cost that looks wrong. */
export function itemsToPrice(report: FoodCostReportBody, counts: { opening: string | null; closing: string }, costs: Record<string, CountCostLine[]>): PriceItem[] {
  const wanted = new Map<string, PriceItem["why"]>();
  for (const line of Object.values(report.lines)) {
    for (const r of line.reasons) {
      if (r.code === "unpriced") for (const i of r.items) wanted.set(`${i.end}:${i.skuId}`, "unpriced");
      if (r.code === "cost_jump") for (const i of r.items) for (const end of ["opening", "closing"] as const) wanted.set(`${end}:${i.skuId}`, "cost_jump");
    }
  }
  const out: PriceItem[] = [];
  for (const end of ["opening", "closing"] as const) {
    const countId = end === "opening" ? counts.opening : counts.closing;
    if (!countId) continue;
    const bySku = new Map<string, CountCostLine[]>();
    for (const l of costs[countId] ?? []) bySku.set(l.skuId, [...(bySku.get(l.skuId) ?? []), l]);
    for (const [skuId, lines] of bySku) {
      const why = wanted.get(`${end}:${skuId}`);
      if (!why) continue;
      const qty = lines.reduce((s, l) => s + l.qty, 0);
      if (why === "unpriced" && qty <= 0) continue;
      const first = lines[0]!;
      out.push({
        countId, end, skuId, name: first.name, unit: first.unitLabel ?? first.countUnit, qty,
        lineIds: lines.map((l) => l.lineId), current: first.cost, basis: first.basis,
        suggestion: lines.find((l) => l.suggestion)?.suggestion ?? null, why,
      });
    }
  }
  const endOrder = { opening: 0, closing: 1 } as const;
  return out.sort((a, b) => a.name.localeCompare(b.name) || endOrder[a.end] - endOrder[b.end]);
}

function FixCosts({ version, sessionId, onDone }: { version: FoodCostVersion; sessionId: string; onDone: (message: string) => void }) {
  const report = bodyOf(version)!;
  const counts = { opening: version.priorSessionId, closing: sessionId };
  const [items, setItems] = useState<PriceItem[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const keyOf = (i: PriceItem) => `${i.countId}:${i.skuId}`;

  async function load() {
    setMessage(null);
    // Nothing unpriced and no cost that looks wrong: nothing to fetch.
    if (!Object.values(report.lines).some((l) => l.reasons.some((r) => r.code === "unpriced" || r.code === "cost_jump"))) {
      setItems([]);
      return;
    }
    try {
      const ids = [counts.opening, counts.closing].filter((x): x is string => x != null);
      const loaded = await Promise.all(ids.map(async (id) => [id, (await getCountCosts(id)).lines] as const));
      const found = itemsToPrice(report, counts, Object.fromEntries(loaded));
      setItems(found);
      setPrices(Object.fromEntries(found.map((i) => [keyOf(i), i.suggestion ? String(Number(i.suggestion.cost.toFixed(4))) : ""])));
    } catch {
      setMessage("Couldn't load the counts' costs. Try again.");
    }
  }

  async function submit() {
    if (!items) return;
    setBusy(true);
    setMessage(null);
    try {
      let revalued = 0;
      const versions: { sessionId: string; version: number }[] = [];
      for (const countId of [...new Set(items.map((i) => i.countId))]) {
        const changes = items
          .filter((i) => i.countId === countId && prices[keyOf(i)]?.trim())
          .flatMap((i) => i.lineIds.map((lineId) => ({ lineId, cost: Number(prices[keyOf(i)]) })));
        if (!changes.length) continue;
        const out = await revalueFoodCount(countId, reason.trim(), changes);
        revalued += out.revalued;
        versions.push(...out.versions);
      }
      onDone(revalueMessage(revalued, versions, sessionId, version.status));
    } catch (e) {
      setMessage(revalueError(e));
    } finally {
      setBusy(false);
    }
  }

  const bad = items?.some((i) => {
    const v = prices[keyOf(i)]?.trim();
    return v ? !(Number.isFinite(Number(v)) && Number(v) >= 0) : false;
  });
  const any = items?.some((i) => prices[keyOf(i)]?.trim());
  return (
    <details className="lq-invd-secondary lq-fv-rerun lq-fco-fix" onToggle={(e) => (e.currentTarget.open && items == null ? void load() : undefined)}>
      <summary>Fix costs</summary>
      <p>
        Price what the report couldn't, or replace a cost that looks wrong. Each count you change gets a new version of both
        brackets it bounds, so they keep agreeing.
      </p>
      {items == null && !message && <p className="lq-muted">Loading the counts' costs…</p>}
      {items && items.length === 0 && <p className="lq-muted">Nothing on this report needs a price.</p>}
      {items?.map((i) => (
        <div key={keyOf(i)} className="lq-fco-price">
          <div>
            <strong>{i.name}</strong>
            <span className="lq-muted">
              {" "}· {i.end} count · {num(i.qty)} {i.unit ? unitWord(i.unit, i.qty) : ""}
            </span>
          </div>
          <div className="lq-pw-sub lq-muted">
            {i.why === "cost_jump" ? `Counted at ${i.current == null ? "no cost" : usd(i.current)}${i.unit ? ` a ${i.unit}` : ""}. The two counts are more than 3× apart, so one of them is wrong: fix that one and leave the other blank.` : "No cost yet."}
            {i.suggestion && ` TPRS suggests ${usd(i.suggestion.cost)}: ${i.suggestion.source === "cost_history" ? "the first price after the count" : "the other count's cost"}.`}
          </div>
          <label className="lq-fco-price-input">
            <span>$ per {i.unit ?? "unit"}</span>
            <input
              inputMode="decimal"
              value={prices[keyOf(i)] ?? ""}
              aria-label={`${i.name} price per ${i.unit ?? "unit"}, ${i.end} count`}
              onChange={(e) => setPrices({ ...prices, [keyOf(i)]: e.target.value })}
            />
          </label>
        </div>
      ))}
      {items && items.length > 0 && (
        <>
          <textarea
            className="lq-invd-explanation-text"
            rows={2}
            maxLength={500}
            aria-label="Why"
            placeholder="Why? e.g. case price frozen as a pound price"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button type="button" className="lq-btn lq-btn-primary" disabled={busy || !any || bad || reason.trim().length < 3} onClick={submit}>
            {busy ? "Revaluing…" : "Revalue"}
          </button>
        </>
      )}
      {message && <p className="lq-pw-sub lq-fv-rerun-message" role="status">{message}</p>}
    </details>
  );
}

export default function FoodCost({
  onDone,
  canManage,
  initialCountId,
}: {
  onDone: () => void;
  /** bar.manage (admin): re-run and revalue. */
  canManage: boolean;
  /** ?view=foodcost&count=<id>: open that bracket straight away. */
  initialCountId?: string | null;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<{ sessionId: string; versions: FoodCostVersion[] | null } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const openedDeepLink = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [reports, counts] = await Promise.all([getFoodCostList(), getCountHistory("food").catch(() => [])]);
        if (!live) return;
        setRows(foodCostRows(reports, counts));
        setPhase("ready");
        if (initialCountId && !openedDeepLink.current) {
          openedDeepLink.current = true;
          void openBracket(initialCountId);
        }
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function openBracket(sessionId: string, version: number | null = null) {
    setLoadingId(sessionId);
    try {
      const versions = await getFoodCost(sessionId);
      setOpen({ sessionId, versions });
      setSelected(version != null && versions?.some((v) => v.version === version) ? version : (versions?.[0]?.version ?? null));
    } catch {
      /* keep the list */
    } finally {
      setLoadingId(null);
    }
  }

  async function rerun(sessionId: string) {
    setRerunning(true);
    setMessage(null);
    try {
      const { version } = await rerunFoodCost(sessionId, reason.trim());
      setReason("");
      await openBracket(sessionId, version);
      setMessage(`Version ${version} written. The earlier versions are unchanged.`);
    } catch (e) {
      setMessage(rerunError(e));
    } finally {
      setRerunning(false);
    }
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Loading food cost…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load food cost.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  // ── one bracket ──
  if (open) {
    const versions = open.versions ?? [];
    const latest = versions[0] ?? null;
    const shown = versions.find((v) => v.version === selected) ?? latest;
    const back = (
      <button type="button" className="lq-back" onClick={() => { setOpen(null); setMessage(null); }}>‹ All food brackets</button>
    );
    if (!shown || !latest) {
      return (
        <div className="lq-invd">
          {back}
          <h2 className="lq-h2" style={{ textAlign: "left" }}>No report yet</h2>
          <p className="lq-muted">
            TPRS writes it within a minute or so of the count being submitted. If it still isn't here, the sales couldn't be read
            yet; it tries again on its own.
          </p>
        </div>
      );
    }
    const body = bodyOf(shown);
    const original = versions.find((v) => v.version === 1) ?? null;
    const settlesAt = new Date(shown.periodEnd).getTime() + SETTLE_MS;
    return (
      <div className="lq-invd lq-fv">
        {back}
        <h2 className="lq-h2" style={{ textAlign: "left" }}>
          {isBaseline(shown) ? `Baseline · ${day(shown.periodEnd)}` : `${day(shown.periodStart)} → ${day(shown.periodEnd)}`}
        </h2>
        <p className="lq-muted lq-invd-meta">
          {body ? `${num(body.period.days)} days · counted ${when(shown.periodEnd)}` : `Counted ${when(shown.periodEnd)}`}
        </p>

        {versions.length > 1 && (
          <div className="lq-segbar" role="tablist" aria-label="Report version">
            {versions.map((v) => (
              <button
                key={v.version}
                type="button"
                role="tab"
                aria-selected={v.version === shown.version}
                className={`lq-seg${v.version === shown.version ? " lq-seg-on" : ""}`}
                onClick={() => setSelected(v.version)}
              >
                {versionLabel(v)}
              </button>
            ))}
          </div>
        )}

        {shown.version > 1 ? (
          <p className="lq-pw-sub lq-fv-status">
            {versionStatus(shown)}
            {shown.version === latest.version ? " This is the version trends read." : ""}
          </p>
        ) : isBaseline(shown) ? null : shown.status === "draft" ? (
          <p className="lq-pw-sub lq-fv-status lq-fv-draft">
            <strong>Draft.</strong> It locks at {clock(settlesAt)}, once the bracket's late invoices are in, and freezes the counts'
            costs then. Until then the numbers can still move.
          </p>
        ) : (
          <p className="lq-pw-sub lq-fv-status lq-muted">
            {shown.catchUp ? "Final. It was first written after its 3 hours had passed, so it locked straight away." : `Final since ${when(shown.finalizedAt)}.`}
            {versions.length > 1 && shown.version !== latest.version ? " A later version is the one trends read." : ""}
          </p>
        )}

        {isBaseline(shown) || !body ? (
          <div className="lq-pw-row">
            <div className="lq-pw-head">
              <span className="lq-invrow-vendor">Baseline count</span>
            </div>
            <div className="lq-pw-sub lq-muted">The first food count. Food cost starts with the next full food count, measured from this one.</div>
          </div>
        ) : (
          <FoodCostReportView report={body} />
        )}

        {message && <p className="lq-pw-sub lq-fv-rerun-message" role="status">{message}</p>}

        {canManage && body && shown.version === latest.version && (
          <FixCosts
            key={`${open.sessionId}:${latest.version}`}
            version={latest}
            sessionId={open.sessionId}
            onDone={(m) => {
              void openBracket(open.sessionId).then(() => setMessage(m));
            }}
          />
        )}

        {canManage && original && !isBaseline(original) && original.status === "final" && (
          <details className="lq-invd-secondary lq-fv-rerun">
            <summary>Re-run as it stands today</summary>
            <p><a href={`/cogs/?view=foodrecipes&count=${encodeURIComponent(open.sessionId)}`}>Review recipes or correct a historical yield</a></p>
            <p>
              Re-reads this bracket with today's purchases and buckets, after a correction. It adds a new version; the earlier ones
              stay as they were.
            </p>
            <textarea
              className="lq-invd-explanation-text"
              rows={2}
              maxLength={500}
              aria-label="What changed"
              placeholder="What changed? e.g. Sysco credit memo read"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button type="button" className="lq-btn lq-btn-primary" disabled={rerunning || reason.trim().length < 3} onClick={() => rerun(open.sessionId)}>
              {rerunning ? "Re-running…" : "Re-run"}
            </button>
          </details>
        )}
      </div>
    );
  }

  // ── the list ──
  return (
    <div className="lq-invlist lq-fv">
      <h2 className="lq-h2" style={{ textAlign: "left" }}>Food cost</h2>
      <p className="lq-muted lq-fv-intro">
        Each food count against the one before it: what food and NA cost (opening + bought − closing), against what they sold.
        Target 30%.
      </p>
      {rows.length === 0 ? (
        <div className="lq-center">
          <p className="lq-muted">No food counts submitted yet. The first full count is the baseline.</p>
        </div>
      ) : (
        rows.map((r) => {
          const s = r.summary;
          const by = r.countedBy ? ` · ${r.countedBy}` : "";
          if (!s) {
            return (
              <button key={r.sessionId} type="button" className="lq-invrow" onClick={() => openBracket(r.sessionId)} disabled={loadingId != null}>
                <div className="lq-invrow-main">
                  <span className="lq-invrow-vendor">{day(r.at)}</span>
                  <span className="lq-badge">Report pending</span>
                </div>
                <div className="lq-invrow-sub lq-muted">Submitted {when(r.at)}{by}. The report usually lands within a minute.</div>
              </button>
            );
          }
          if (s.baseline) {
            return (
              <button key={r.sessionId} type="button" className="lq-invrow" onClick={() => openBracket(r.sessionId)} disabled={loadingId != null}>
                <div className="lq-invrow-main">
                  <span className="lq-invrow-vendor">Baseline · {day(s.periodEnd)}</span>
                  <span className="lq-badge lq-badge-confirmed">Baseline</span>
                </div>
                <div className="lq-invrow-sub lq-muted">The first food count{by}. The next one gets the first report.</div>
              </button>
            );
          }
          return (
            <button key={r.sessionId} type="button" className="lq-invrow" onClick={() => openBracket(r.sessionId)} disabled={loadingId != null}>
              <div className="lq-invrow-main">
                <span className="lq-invrow-vendor">{day(s.periodStart)} → {day(s.periodEnd)}</span>
                <span>
                  {s.provisional && <><span className="lq-badge lq-badge-flagged">Provisional</span>{" "}</>}
                  {s.status === "draft" ? (
                    <span className="lq-badge lq-badge-flagged">Draft</span>
                  ) : (
                    <span className="lq-badge lq-badge-confirmed">{s.catchUp && s.version === 1 ? "Final · late" : "Final"}</span>
                  )}
                </span>
              </div>
              <div className="lq-invrow-sub">
                <strong>{pctText(s.foodNaCogsPct)}</strong>
                <span className="lq-muted">
                  {s.foodNaCogsCents != null && s.foodNaSalesCents != null && ` · ${money(s.foodNaCogsCents)} on ${money(s.foodNaSalesCents)} of sales`}
                  {s.versions > 1 && ` · v${s.version} of ${s.versions}`}
                  {by}
                </span>
              </div>
            </button>
          );
        })
      )}

      <div className="lq-footer">
        <div className="lq-savestate" />
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>Home</button>
        </div>
      </div>
    </div>
  );
}
