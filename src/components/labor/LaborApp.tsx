import { useCallback, useEffect, useState } from "react";
import "../liquor/liquor.css";
import "./labor.css";
import Login from "../liquor/views/Login";
import { useDictation } from "../liquor/useSpeech";
import {
  ForbiddenError,
  extractNote,
  getDays,
  getMe,
  saveNote,
  undoNote,
  type FlaggedDay,
  type LaborActor,
  type NoteCategory,
  type NoteKind,
  type ProposedNote,
} from "./api";

/**
 * Root island for the staff labor surface at twistedpin.com/labor.
 *
 * ONE JOB: let the GM say why a day was weird, in his own voice, in about ten
 * seconds. The engine can see that Wednesday ran 16 hours over; only he knows it
 * was a training day, and until he says so that day teaches the baseline that
 * 20h is a normal Wednesday.
 *
 * Reuses the bar app wholesale — the same PIN pad (which issues the same signed
 * session cookie), the same `useDictation` run-on hook that already works well
 * for him on Android, the same visual language. The one thing that is NOT reused
 * is the permission: this is `labor.annotate`, because `cash.admin` is
 * deliberately invisible to the GM and folding onto it would lock out the person
 * the surface exists for.
 *
 * Voice is an accelerant, never a requirement: where the Web Speech API is
 * missing (iOS Safari), the hook reports `supported:false` and the same flow
 * runs by typing.
 */

type View = "loading" | "login" | "home" | "forbidden";

const CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: "training", label: "Training" },
  { value: "deep_clean", label: "Deep clean" },
  { value: "inventory", label: "Inventory" },
  { value: "callout", label: "Someone called out" },
  { value: "event", label: "Event / party" },
  { value: "weather", label: "Weather" },
  { value: "other", label: "Something else" },
];

export default function LaborApp() {
  const [view, setView] = useState<View>("loading");
  const [, setActor] = useState<LaborActor | null>(null);
  const [days, setDays] = useState<FlaggedDay[]>([]);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [lastGroupId, setLastGroupId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await getDays();
    setDays(list);
  }, []);

  const bootstrap = useCallback(async () => {
    setView("loading");
    try {
      const me = await getMe();
      setActor(me);
      await load();
      setView("home");
    } catch (e) {
      if (e instanceof ForbiddenError) setView("forbidden");
      else setView("login");
    }
  }, [load]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  if (view === "loading") return <div className="lq-shell"><p className="lq-muted">Loading…</p></div>;
  if (view === "login") return <div className="lq-shell"><Login onLoggedIn={() => void bootstrap()} /></div>;
  if (view === "forbidden")
    return (
      <div className="lq-shell">
        <h2 className="lq-h2">Not your area</h2>
        <p className="lq-muted">This login doesn't have access to labor notes. Ask Jon to add it.</p>
      </div>
    );

  const unanswered = days.filter((d) => d.depts.some((x) => !x.note));
  const answered = days.filter((d) => d.depts.every((x) => x.note));

  return (
    <div className="lq-shell lb-shell">
      <header className="lb-head">
        <h1 className="lq-h1">Why was this day busy?</h1>
        <p className="lq-muted lb-sub">
          These days ran well over their usual. A word from you keeps a one-off from
          becoming the new "normal" in the weekly report.
        </p>
      </header>

      {lastGroupId && (
        <div className="lb-undo">
          <span>Saved.</span>
          <button
            className="lb-linkbtn"
            onClick={async () => { await undoNote(lastGroupId); setLastGroupId(null); await load(); }}
          >
            Undo
          </button>
        </div>
      )}

      {unanswered.length === 0 && (
        <p className="lb-empty">Nothing needs a word right now. Everything's running close to normal.</p>
      )}

      {unanswered.map((day) => (
        <DayCard
          key={day.date}
          day={day}
          open={openDate === day.date}
          onToggle={() => setOpenDate(openDate === day.date ? null : day.date)}
          onSaved={async (groupId) => {
            setLastGroupId(groupId);
            setOpenDate(null);
            await load();
          }}
        />
      ))}

      {answered.length > 0 && (
        <section className="lb-answered">
          <h2 className="lb-h2">What you've told us</h2>
          {answered.map((day) => (
            <div key={day.date} className="lb-answered-row">
              <strong>{day.label}</strong>
              <span>{day.depts.find((x) => x.note)?.note?.reasonText ?? "—"}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function DayCard({
  day, open, onToggle, onSaved,
}: {
  day: FlaggedDay;
  open: boolean;
  onToggle: () => void;
  onSaved: (groupId: string) => void;
}) {
  const [proposed, setProposed] = useState<ProposedNote | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(day.depts.map((d) => d.dept));

  const dictation = useDictation();

  const heard = `${dictation.transcript} ${dictation.interim}`.trim();
  const words = heard || typed;

  async function readBack() {
    if (!words.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const { proposed: p } = await extractNote(day.date, words);
      setProposed(p);
      // If he scoped it to specific departments, honour that.
      if (p.depts.length) {
        const wanted = new Set(p.depts.map((s) => s.toLowerCase()));
        const match = day.depts.filter((d) => wanted.has(d.deptLabel.toLowerCase()) || wanted.has(d.dept.toLowerCase()));
        if (match.length) setPicked(match.map((d) => d.dept));
      }
    } catch {
      setErr("Couldn't read that back. You can still file it by hand below.");
      setProposed({ kind: "unclear", category: null, reasonText: words.trim().slice(0, 400), depts: [], confident: false });
    } finally {
      setBusy(false);
    }
  }

  async function commit(kind: NoteKind, category: NoteCategory | null, reasonText: string) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await saveNote({
        salesDate: day.date,
        depts: picked,
        kind,
        category,
        reasonText,
        transcript: heard || null,
        source: heard ? "voice" : "typed",
      });
      dictation.stop();
      onSaved(res.groupId);
    } catch {
      setErr("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={open ? "lb-card lb-card-open" : "lb-card"}>
      <button className="lb-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="lb-date">{day.label}</span>
        <span className="lb-what">
          {day.depts.filter((d) => !d.note).map((d) => `${d.deptLabel} +${d.overHours}h`).join(" · ")}
        </span>
      </button>

      {open && (
        <div className="lb-body">
          <ul className="lb-facts">
            {day.depts.map((d) => (
              <li key={d.dept}>
                {d.summary}
                {d.note && <em className="lb-already"> — you said: {d.note.reasonText}</em>}
              </li>
            ))}
          </ul>

          {!proposed && (
            <>
              {dictation.supported ? (
                <div className="lb-mic-wrap">
                  <button
                    className={dictation.recording ? "lb-mic lb-mic-on" : "lb-mic"}
                    onClick={() => (dictation.recording ? dictation.stop() : dictation.start())}
                  >
                    {dictation.recording ? `Listening… ${dictation.seconds}s — tap to stop` : "Hold the thought — tap to talk"}
                  </button>
                  {heard && <p className="lb-heard">{heard}</p>}
                </div>
              ) : (
                <p className="lq-muted lb-note">Voice isn't available on this browser — just type it.</p>
              )}

              <textarea
                className="lb-textarea"
                placeholder={dictation.supported ? "…or type it instead" : "What happened that day?"}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={2}
              />

              <button className="lb-primary" disabled={!words.trim() || busy} onClick={() => void readBack()}>
                {busy ? "Reading…" : "Next"}
              </button>
            </>
          )}

          {proposed && (
            <Confirm
              proposed={proposed}
              day={day}
              picked={picked}
              setPicked={setPicked}
              busy={busy}
              onBack={() => setProposed(null)}
              onCommit={commit}
            />
          )}

          {err && <p className="lq-error">{err}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Read it back before anything is written. The model's classification is a
 * SUGGESTION — a wrong bucket must never silently change a baseline, so the
 * kind is always an explicit tap. "Just how it goes" files nothing at all,
 * which is the honest option for a day that was simply busy.
 */
function Confirm({
  proposed, day, picked, setPicked, busy, onBack, onCommit,
}: {
  proposed: ProposedNote;
  day: FlaggedDay;
  picked: string[];
  setPicked: (d: string[]) => void;
  busy: boolean;
  onBack: () => void;
  onCommit: (kind: NoteKind, category: NoteCategory | null, reason: string) => void;
}) {
  const [reason, setReason] = useState(proposed.reasonText);
  const [category, setCategory] = useState<NoteCategory | null>(proposed.category);

  return (
    <div className="lb-confirm">
      <p className="lb-readback">“{reason}”</p>
      <input className="lb-edit" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />

      {day.depts.length > 1 && (
        <div className="lb-depts">
          <span className="lb-label">Applies to</span>
          {day.depts.map((d) => (
            <button
              key={d.dept}
              className={picked.includes(d.dept) ? "lb-chip lb-chip-on" : "lb-chip"}
              onClick={() =>
                setPicked(picked.includes(d.dept) ? picked.filter((x) => x !== d.dept) : [...picked, d.dept])
              }
            >
              {d.deptLabel}
            </button>
          ))}
        </div>
      )}

      <div className="lb-cats">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={category === c.value ? "lb-chip lb-chip-on" : "lb-chip"}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="lb-choices">
        <button
          className="lb-primary"
          disabled={busy || !picked.length}
          onClick={() => onCommit("one_off", category, reason)}
        >
          One-off — don't count it as normal
        </button>
        <button
          className="lb-secondary"
          disabled={busy || !picked.length}
          onClick={() => onCommit("new_normal", category, reason)}
        >
          This is the new normal
        </button>
        <button className="lb-linkbtn" onClick={onBack} disabled={busy}>Back</button>
      </div>
      <p className="lb-fineprint">
        “One-off” leaves the day out of the usual-hours averages. “New normal” doesn't
        change any numbers — it flags the claim so we can check it against what the
        days actually earned.
      </p>
    </div>
  );
}
