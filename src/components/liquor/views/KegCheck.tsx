import { useRef, useState } from "react";
import { BarApiError, submitKegCheck } from "../api";
import CountKegs from "./CountKegs";
import EmptyKegs from "./EmptyKegs";
import BottledBeer from "./BottledBeer";

/**
 * Keg check — backups and empties in one pass, one Send, ONE email.
 *
 * The counter makes a single trip to the back room, where the full backup
 * stock and the stack of spent kegs are both sitting right there. Treating
 * that as two separate reports meant two emails, and there was no way to
 * collapse them: two independent submits either send twice or the second one
 * goes out silently. Merging at the UI layer removes the problem instead of
 * papering over it with a delayed batch job.
 *
 * Bottled beer joined as a THIRD half (0162): we only sell it on league
 * nights, it lives in the walk-in beside the kegs, and it is the same trip.
 * Unlike the keg halves its rows are real liquor-count lines against real SKUs,
 * in a session flagged is_full_count = false — so it reaches costs, invoices
 * and the order guide without ever bracketing a spirits variance period.
 *
 * Each half keeps its own draft session and autosave (unchanged, and each
 * still resumes independently after a reload). This screen only owns the
 * accordion, the running totals, and the single submit that closes whichever
 * halves were actually filled in. Doing just one half is normal and expected —
 * the email renders only the sections that arrived.
 */

type Half = { sessionId: string | null; count: number; busy?: boolean; observed?: boolean };

export default function KegCheck({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState<"backups" | "empties" | "beer" | null>("backups");
  const [backups, setBackups] = useState<Half>({ sessionId: null, count: 0 });
  const [empties, setEmpties] = useState<Half>({ sessionId: null, count: 0 });
  const [beer, setBeer] = useState<Half>({ sessionId: null, count: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<
    { totalKegs: number; brandCount: number; totalBottles: number; emailed: boolean } | null
  >(null);

  // Flush handles the children reassign on every render, so Send always
  // persists what is on screen right now rather than the last autosave tick.
  const flushBackups = useRef<(() => Promise<boolean>) | null>(null);
  const flushEmpties = useRef<(() => Promise<boolean>) | null>(null);
  const flushBeer = useRef<(() => Promise<boolean>) | null>(null);

  const voicePending = backups.busy || empties.busy;
  const beerCounted = beer.count > 0 || beer.observed;
  const nothingEntered = backups.count === 0 && empties.count === 0 && !beerCounted;

  async function send() {
    if (submitting || nothingEntered || voicePending) return;
    setSubmitting(true);
    setErr(null);
    try {
      // Persist every half before closing any — a half that failed to save
      // would otherwise submit as empty and silently lose the trip. Each save
      // now SAYS it failed: they used to swallow the error and Send went on
      // regardless (independent review, 2026-10-03).
      const saved = [
        await flushBackups.current?.(),
        await flushEmpties.current?.(),
        await flushBeer.current?.(),
      ];
      if (saved.includes(false)) {
        setErr("Couldn't save everything on this screen, so nothing was sent. Check your connection and press Send again.");
        setSubmitting(false);
        return;
      }
      const res = await submitKegCheck({
        // Only send a half that actually has something in it, so an untouched
        // draft is left open rather than closed empty.
        kegCountId: backups.count > 0 ? backups.sessionId : null,
        emptyReportId: empties.count > 0 ? empties.sessionId : null,
        beerCountId: beerCounted ? beer.sessionId : null,
      });
      setDone({
        totalKegs: res.totalKegs,
        brandCount: res.brandCount,
        totalBottles: res.totalBottles,
        emailed: res.emailed,
      });
    } catch (error) {
      setErr(error instanceof BarApiError && error.status === 409
        ? "This saved count is already closed or belongs to a different count. Exit and reopen Keg check before trying again."
        : "Couldn't send that — check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    const parts = [
      done.totalKegs > 0 ? `${done.totalKegs} backup keg${done.totalKegs === 1 ? "" : "s"}` : null,
      done.brandCount > 0 ? `${done.brandCount} brand${done.brandCount === 1 ? "" : "s"} empty` : null,
      beerCounted
        ? `${done.totalBottles} bottle${done.totalBottles === 1 ? "" : "s"} of beer`
        : null,
    ].filter(Boolean);
    return (
      <div className="lq-center">
        <p className="lq-done-emoji" aria-hidden="true">✅</p>
        <h2 className="lq-h2">{done.emailed ? "Keg check sent" : "Keg check saved"}</h2>
        <p className="lq-muted">{parts.join(" · ")}</p>
        <button className="lq-btn lq-btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="lq-kegcheck">
      <p className="lq-muted lq-keg-hint">
        Count the sections you checked, then send once.
      </p>

      <section className="lq-kc-section">
        <button
          type="button"
          className="lq-kc-head"
          aria-expanded={open === "backups"}
          disabled={submitting || !!voicePending}
          onClick={() => setOpen(open === "backups" ? null : "backups")}
        >
          <span className="lq-kc-caret" aria-hidden="true">{open === "backups" ? "▾" : "▸"}</span>
          <span className="lq-kc-names">
            <span className="lq-kc-title">Backup kegs</span>
            <span className="lq-kc-sub">full / untapped</span>
          </span>
          <span className={`lq-kc-badge${backups.count > 0 ? " lq-kc-badge-on" : ""}`}>
            {backups.count}
          </span>
        </button>
        {/* Kept mounted when collapsed: unmounting would tear down the child's
            session + autosave and lose anything typed but not yet flushed. */}
        <div className={open === "backups" ? "lq-kc-body" : "lq-kc-body lq-kc-hidden"}>
          <CountKegs embedded locked={submitting} onEmbedState={setBackups} embedFlushRef={flushBackups} />
        </div>
      </section>

      <section className="lq-kc-section">
        <button
          type="button"
          className="lq-kc-head"
          aria-expanded={open === "empties"}
          disabled={submitting || !!voicePending}
          onClick={() => setOpen(open === "empties" ? null : "empties")}
        >
          <span className="lq-kc-caret" aria-hidden="true">{open === "empties" ? "▾" : "▸"}</span>
          <span className="lq-kc-names">
            <span className="lq-kc-title">Empty kegs</span>
            <span className="lq-kc-sub">rough amount by brand</span>
          </span>
          <span className={`lq-kc-badge${empties.count > 0 ? " lq-kc-badge-on" : ""}`}>
            {empties.count}
          </span>
        </button>
        <div className={open === "empties" ? "lq-kc-body" : "lq-kc-body lq-kc-hidden"}>
          <EmptyKegs embedded locked={submitting} onEmbedState={setEmpties} embedFlushRef={flushEmpties} />
        </div>
      </section>

      <section className="lq-kc-section">
        <button
          type="button"
          className="lq-kc-head"
          aria-expanded={open === "beer"}
          disabled={submitting || !!voicePending}
          onClick={() => setOpen(open === "beer" ? null : "beer")}
        >
          <span className="lq-kc-caret" aria-hidden="true">{open === "beer" ? "▾" : "▸"}</span>
          <span className="lq-kc-names">
            <span className="lq-kc-title">Bottled beer</span>
            <span className="lq-kc-sub">cases, six-packs, bottles</span>
          </span>
          <span className={`lq-kc-badge${beerCounted ? " lq-kc-badge-on" : ""}`}>
            {beer.count > 0 ? beer.count : beerCounted ? "✓" : "0"}
          </span>
        </button>
        <div className={open === "beer" ? "lq-kc-body" : "lq-kc-body lq-kc-hidden"}>
          <BottledBeer embedded locked={submitting} onEmbedState={setBeer} embedFlushRef={flushBeer} />
        </div>
      </section>

      <div className="lq-footer">
        <div className="lq-savestate">{err && <span className="lq-error">{err}</span>}</div>
        <div className="lq-footer-actions">
          <span className="lq-muted lq-count-tally">
            {backups.count} keg{backups.count === 1 ? "" : "s"} · {empties.count} empty ·{" "}
            {beerCounted ? "beer counted" : "beer unchecked"}
          </span>
          <button type="button" className="lq-btn lq-btn-ghost" disabled={submitting || !!voicePending} onClick={onDone}>
            Home
          </button>
          <button
            type="button"
            className="lq-btn lq-btn-primary"
            disabled={submitting || nothingEntered || voicePending}
            onClick={send}
          >
            {submitting ? "Sending…" : voicePending ? "Finish recording first" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
