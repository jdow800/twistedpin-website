import { useEffect, useRef, useState } from "react";
import {
  BarApiError,
  ForbiddenError,
  getCountHistory,
  getFoodVariance,
  getFoodVarianceList,
  rerunFoodVariance,
  type CountSummary,
  type FoodVarianceBasis,
  type FoodVarianceReportBody,
  type FoodVarianceSummary,
  type FoodVarianceVersion,
} from "../api";
import { FoodVarianceReportView, overUnder, versionChanges } from "../FoodVarianceReport";

// Food variance, per food count (TPRS migration 0202; Opsi BUILD-SPEC
// 11.121). Each submitted full food count is compared with the one before it.
// The first is the baseline. A report is a draft for 3 hours while the
// bracket's late invoices land, then frozen. Version 1 stays the default; an
// admin can re-run a frozen bracket after a recipe or yield correction, which
// adds a version beside it.

/** How long a draft settles before TPRS freezes it (workers/food-variance.ts). */
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

const isBaseline = (v: FoodVarianceVersion) => "baseline" in v.report;
const bodyOf = (v: FoodVarianceVersion) => (isBaseline(v) ? null : (v.report as FoodVarianceReportBody));
const basisOf = (v: FoodVarianceVersion) => ("baseline" in v.basis ? null : (v.basis as FoodVarianceBasis));

/** A row on the list: a count with its report, or a submitted count still waiting for one. */
interface Row {
  sessionId: string;
  at: string;
  summary: FoodVarianceSummary | null;
  countedBy: string | null;
}

/** Reports first, then the submitted full food counts that have none yet. */
export function foodVarianceRows(reports: FoodVarianceSummary[], counts: CountSummary[]): Row[] {
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

function statusBadge(s: { status: "draft" | "final"; catchUp: boolean }) {
  if (s.status === "draft") return <span className="lq-badge lq-badge-flagged">Draft</span>;
  return <span className="lq-badge lq-badge-confirmed">{s.catchUp ? "Final · late" : "Final"}</span>;
}

/** Why a re-run was refused, in words. */
function rerunError(e: unknown): string {
  if (e instanceof ForbiddenError) return "Only an admin can re-run a report.";
  if (e instanceof BarApiError) {
    const code = (() => {
      try {
        return (JSON.parse(String(e.body ?? "")) as { error?: string }).error;
      } catch {
        return undefined;
      }
    })();
    if (code === "not_final") return "This report is still a draft. It locks itself; re-run it after that.";
    if (code === "baseline") return "A baseline has nothing to re-run.";
    if (code === "no_gotab") return "GoTab can't be read right now, so the sales can't be re-read. Try again later.";
    if (e.status === 400) return "Say what changed (at least 3 characters).";
  }
  return "The re-run didn't go through. Nothing changed; try again.";
}

export default function FoodVariance({
  onDone,
  canRerun,
  initialCountId,
}: {
  onDone: () => void;
  /** bar.manage (admin): a re-run goes with a recipe or yield correction. */
  canRerun: boolean;
  /** ?view=foodvariance&count=<id>: open that count's report straight away. */
  initialCountId?: string | null;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<{ sessionId: string; versions: FoodVarianceVersion[] | null } | null>(null);
  const [selected, setSelected] = useState(1);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [rerunMessage, setRerunMessage] = useState<string | null>(null);
  const openedDeepLink = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [reports, counts] = await Promise.all([getFoodVarianceList(), getCountHistory("food").catch(() => [])]);
        if (!live) return;
        setRows(foodVarianceRows(reports, counts));
        setPhase("ready");
        if (initialCountId && !openedDeepLink.current) {
          openedDeepLink.current = true;
          void openCount(initialCountId);
        }
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function openCount(sessionId: string, version = 1) {
    setLoadingId(sessionId);
    setRerunMessage(null);
    try {
      const versions = await getFoodVariance(sessionId);
      setOpen({ sessionId, versions });
      setSelected(versions?.some((v) => v.version === version) ? version : 1);
    } catch {
      /* keep the list */
    } finally {
      setLoadingId(null);
    }
  }

  async function rerun(sessionId: string) {
    setRerunning(true);
    setRerunMessage(null);
    try {
      const { version } = await rerunFoodVariance(sessionId, reason.trim());
      setReason("");
      await openCount(sessionId, version);
      setRerunMessage(`Version ${version} written. The original is unchanged.`);
    } catch (e) {
      setRerunMessage(rerunError(e));
    } finally {
      setRerunning(false);
    }
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Loading food variance…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load food variance.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  // ── one count ──
  if (open) {
    const versions = open.versions ?? [];
    const original = versions.find((v) => v.version === 1) ?? null;
    const shown = versions.find((v) => v.version === selected) ?? original;
    const back = (
      <button type="button" className="lq-back" onClick={() => setOpen(null)}>‹ All food counts</button>
    );
    if (!shown || !original) {
      return (
        <div className="lq-invd">
          {back}
          <h2 className="lq-h2" style={{ textAlign: "left" }}>No report yet</h2>
          <p className="lq-muted">
            TPRS writes it within a minute or so of the count being submitted. If it still isn't here, the sales
            couldn't be read yet; it tries again on its own.
          </p>
        </div>
      );
    }
    const body = bodyOf(shown);
    const originalBody = bodyOf(original);
    const settlesAt = new Date(shown.periodEnd).getTime() + SETTLE_MS;
    return (
      <div className="lq-invd lq-fv">
        {back}
        <h2 className="lq-h2" style={{ textAlign: "left" }}>
          {isBaseline(shown) ? `Baseline · ${day(shown.periodEnd)}` : `${day(shown.periodStart)} → ${day(shown.periodEnd)}`}
        </h2>
        <p className="lq-muted lq-invd-meta">
          {isBaseline(shown)
            ? `Counted ${when(shown.periodEnd)}`
            : `${basisOf(shown)?.window.days ?? "?"} days · counted ${when(shown.periodEnd)}`}
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
                {v.version === 1 ? "Original" : `Re-run ${v.version}`}
              </button>
            ))}
          </div>
        )}

        {shown.version > 1 ? (
          <p className="lq-pw-sub lq-fv-status">
            Re-run {when(shown.createdAt)}{shown.computedBy ? ` by ${shown.computedBy}` : ""}: “{shown.reason}”. The
            original is still the report of record.
          </p>
        ) : isBaseline(shown) ? null : shown.status === "draft" ? (
          <p className="lq-pw-sub lq-fv-status lq-fv-draft">
            <strong>Draft.</strong> It locks at {clock(settlesAt)}, once the bracket's late invoices are in. Until
            then the numbers can still move.
          </p>
        ) : (
          <p className="lq-pw-sub lq-fv-status lq-muted">
            {shown.catchUp
              ? "Final. It was first written after its 3 hours had passed, so it locked straight away."
              : `Final since ${when(shown.finalizedAt)}.`}
          </p>
        )}

        {isBaseline(shown) || !body ? (
          <div className="lq-pw-row">
            <div className="lq-pw-head">
              <span className="lq-invrow-vendor">Baseline count</span>
            </div>
            <div className="lq-pw-sub lq-muted">
              The first food count. Food variance starts with the next full food count, measured from this one.
            </div>
          </div>
        ) : (
          <FoodVarianceReportView
            report={body}
            basis={basisOf(shown)}
            changes={shown.version > 1 && originalBody ? versionChanges({ report: originalBody, basis: basisOf(original) }, { report: body, basis: basisOf(shown) }) : null}
          />
        )}

        {rerunMessage && <p className="lq-pw-sub lq-fv-rerun-message" role="status">{rerunMessage}</p>}

        {canRerun && !isBaseline(original) && original.status === "final" && (
          <details className="lq-invd-secondary lq-fv-rerun">
            <summary>Re-run with today's recipes</summary>
            <p><a href={`/cogs/?view=foodrecipes&count=${encodeURIComponent(open.sessionId)}`}>Review recipes or correct a historical yield</a></p>
            <p>
              Re-reads this bracket with today's recipes and deliveries, retaining its reviewed historical yields. It adds a new
              version beside the original; the original stays the report of record.
            </p>
            <textarea
              className="lq-invd-explanation-text"
              rows={2}
              maxLength={500}
              aria-label="What changed"
              placeholder="What changed? e.g. Grande yield corrected"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              className="lq-btn lq-btn-primary"
              disabled={rerunning || reason.trim().length < 3}
              onClick={() => rerun(open.sessionId)}
            >
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
      <h2 className="lq-h2" style={{ textAlign: "left" }}>Food variance</h2>
      <p className="lq-muted lq-fv-intro">
        Each food count against the one before it: what the kitchen used, and what the recipes say sales and
        catering used.
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
              <button key={r.sessionId} type="button" className="lq-invrow" onClick={() => openCount(r.sessionId)} disabled={loadingId != null}>
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
              <button key={r.sessionId} type="button" className="lq-invrow" onClick={() => openCount(r.sessionId)} disabled={loadingId != null}>
                <div className="lq-invrow-main">
                  <span className="lq-invrow-vendor">Baseline · {day(s.periodEnd)}</span>
                  <span className="lq-badge lq-badge-confirmed">Baseline</span>
                </div>
                <div className="lq-invrow-sub lq-muted">The first food count{by}. The next one gets the first report.</div>
              </button>
            );
          }
          const net = s.netVarianceDollars != null ? overUnder(s.netVarianceDollars) : null;
          return (
            <button key={r.sessionId} type="button" className="lq-invrow" onClick={() => openCount(r.sessionId)} disabled={loadingId != null}>
              <div className="lq-invrow-main">
                <span className="lq-invrow-vendor">{day(s.periodStart)} → {day(s.periodEnd)}</span>
                {statusBadge(s)}
              </div>
              <div className="lq-invrow-sub">
                {net ? <span className={net.className}>{net.text}</span> : <span className="lq-muted">no total</span>}
                <span className="lq-muted">
                  {s.mappedSalesPct != null && ` · ${s.mappedSalesPct}% of food sales have a recipe`}
                  {s.incomplete && " · incomplete"}
                  {s.versions > 1 && ` · ${s.versions} versions`}
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
