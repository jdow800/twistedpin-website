import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarApiError,
  MAX_TEACHER_GROUP_FILES,
  NotAuthedError,
  TEACHER_GROUP_EMAIL_DOMAIN,
  getTeacherGroupUpload,
  listTeacherGroupUploads,
  teacherGroupPdfUrl,
  uploadTeacherGroupSheet,
  type TeacherGroupLaneOutcome,
  type TeacherGroupLine,
  type TeacherGroupStatus,
  type TeacherGroupUpload,
  type TeacherGroupUploadSummary,
} from "../api";

// Teacher Group Organizer. Staff add the organizer's Word doc(s), plus any
// instructions of our own on top ("Lane 15 is broken, skip it"); TPRS reads
// every line twice, applies the instructions, resizes that night's lane holds
// when it all checks out, and emails the printable packet (a cover sheet of
// questions, then the kitchen and POS pages). This screen sends the upload,
// then shows what happened: the lanes, each instruction and what was done,
// what needs an answer, and their sheet line by line next to how it was read,
// so nobody has to trust that nothing was missed.

type Draft = { files: File[]; instructions: string; eventDate: string };
const EMPTY: Draft = { files: [], instructions: "", eventDate: "" };

const EMAIL_KEY = "cogs:teacher-group:emails";
const POLL_MS = 3000;

const STATUS_LABEL: Record<TeacherGroupStatus, string> = {
  pending: "Waiting",
  processing: "Reading…",
  done: "Emailed",
  failed: "Failed",
};
const LANE_LABEL: Record<TeacherGroupLaneOutcome["status"], string> = {
  applied: "Updated",
  unchanged: "No change",
  skipped: "Not changed",
};
const KIND_LABEL: Record<string, string> = {
  title: "Title",
  shift: "Shift",
  lane: "Lane",
  extra: "Extra food",
  absent: "Absent",
  note: "Note",
};

function rememberedEmails(): string {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}
function rememberEmails(value: string): void {
  try {
    window.localStorage.setItem(EMAIL_KEY, value);
  } catch {
    /* private mode or disabled storage: they retype it next time */
  }
}

/** The addresses typed, or what's wrong with them in plain words. */
function parseEmails(raw: string): { emails: string[]; problem: string | null } {
  const emails = [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return { emails, problem: "Add an email for the packet." };
  const outside = emails.filter((e) => !/^[^@\s]+@twistedpin\.com$/.test(e));
  if (outside.length) {
    return { emails, problem: `The packet only goes to ${TEACHER_GROUP_EMAIL_DOMAIN} addresses (not ${outside.join(", ")}).` };
  }
  if (emails.length > 6) return { emails, problem: "Six addresses at most." };
  return { emails, problem: null };
}

function fileProblem(f: File): string | null {
  if (/\.(docx|txt)$/i.test(f.name)) return null;
  if (/\.doc$/i.test(f.name)) return `${f.name} is an older Word file. Open it in Word, Save As .docx, and add that.`;
  if (/\.pdf$/i.test(f.name)) return `${f.name} is a PDF. We need their Word doc (.docx).`;
  return `${f.name} can't be read. Add their Word doc (.docx).`;
}

const dayLabel = (d: string | null, status: TeacherGroupStatus) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    : status === "failed"
      ? "Night unknown"
      : "Night not read yet";
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const unplaced = (l: TeacherGroupLine) => l.kind === null || l.kind === "other";

export default function TeacherGroup({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [emails, setEmails] = useState(rememberedEmails);
  const [runnerTickets, setRunnerTickets] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // The last upload sent from this screen, so a failed read can be fixed and resent.
  const [sent, setSent] = useState<{ id: string; draft: Draft } | null>(null);
  const [recent, setRecent] = useState<TeacherGroupUploadSummary[]>([]);
  const [recentError, setRecentError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await listTeacherGroupUploads());
      setRecentError(false);
    } catch {
      setRecentError(true);
    }
  }, []);

  useEffect(() => {
    if (!openId) void loadRecent();
  }, [openId, loadRecent]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...draft.files];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      const problem = fileProblem(f);
      if (problem) problems.push(problem);
      else if (next.length >= MAX_TEACHER_GROUP_FILES) problems.push(`${MAX_TEACHER_GROUP_FILES} docs at most in one upload.`);
      else if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setDraft((d) => ({ ...d, files: next }));
    setError(problems.length ? [...new Set(problems)].join(" ") : null);
  }

  async function send() {
    if (sending) return;
    if (!draft.files.length) {
      setError("Add their Word doc first.");
      return;
    }
    const { emails: to, problem } = parseEmails(emails);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const id = await uploadTeacherGroupSheet({ ...draft, emailTo: to, runnerTickets });
      rememberEmails(to.join(", "));
      setSent({ id, draft });
      setDraft(EMPTY);
      setOpenId(id);
    } catch (e) {
      setError(e instanceof BarApiError ? e.message : "The upload didn't go through. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (openId) {
    const retry =
      sent && sent.id === openId
        ? () => {
            setDraft(sent.draft);
            setOpenId(null);
          }
        : undefined;
    return <UploadResult id={openId} onBack={() => setOpenId(null)} onRetry={retry} />;
  }

  const full = draft.files.length >= MAX_TEACHER_GROUP_FILES;
  return (
    <div className="lq-upload lq-tg">
      <h2 className="lq-h2">Teacher Group Organizer</h2>
      <p className="lq-muted lq-upload-hint">Add the organizer's Word doc. If one email has two docs, add both.</p>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button type="button" className="lq-add-pages" disabled={full} onClick={() => fileRef.current?.click()}>
        <span className="lq-action-emoji" aria-hidden="true">📄</span>
        <span>
          {full
            ? `Max ${MAX_TEACHER_GROUP_FILES} docs`
            : draft.files.length
              ? `Add another doc (${draft.files.length}/${MAX_TEACHER_GROUP_FILES})`
              : "Add their Word doc"}
        </span>
      </button>

      {draft.files.length > 0 && (
        <ul className="lq-tg-files">
          {draft.files.map((f, i) => (
            <li key={`${f.name}-${f.size}`} className="lq-tg-file">
              <span className="lq-tg-file-name">{f.name}</span>
              <button
                type="button"
                className="lq-tg-file-x"
                aria-label={`remove ${f.name}`}
                onClick={() => setDraft((d) => ({ ...d, files: d.files.filter((_, k) => k !== i) }))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="lq-tg-field">
        <span className="lq-tg-label">
          Added instructions <span className="lq-muted">(optional)</span>
        </span>
        <textarea
          className="lq-tg-input lq-tg-paste"
          rows={4}
          value={draft.instructions}
          onChange={(e) => {
            setDraft((d) => ({ ...d, instructions: e.target.value }));
            setError(null);
          }}
          placeholder={"Anything on top of their doc, one per line. e.g.\nLane 15 is broken, skip it\nThe 2nd shift is staying until 8pm"}
        />
      </label>

      <label className="lq-tg-field">
        <span className="lq-tg-label">
          Which night <span className="lq-muted">(optional)</span>
        </span>
        <input
          type="date"
          className="lq-tg-input"
          value={draft.eventDate}
          onChange={(e) => setDraft((d) => ({ ...d, eventDate: e.target.value }))}
        />
        <span className="lq-tg-help lq-muted">Leave blank to use the date on their sheet.</span>
      </label>

      <label className="lq-tg-field">
        <span className="lq-tg-label">Email the packet to</span>
        <input
          type="text"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="lq-tg-input"
          value={emails}
          onChange={(e) => {
            setEmails(e.target.value);
            setError(null);
          }}
          placeholder="kitchen@twistedpin.com"
        />
        <span className="lq-tg-help lq-muted">{TEACHER_GROUP_EMAIL_DOMAIN} only. Jon always gets a copy.</span>
      </label>

      <label className="lq-tg-check">
        <input type="checkbox" checked={runnerTickets} onChange={(e) => setRunnerTickets(e.target.checked)} />
        <span>
          Add runner tickets <span className="lq-muted">(a cut-apart ticket per lane)</span>
        </span>
      </label>

      {error && (
        <p className="lq-error" role="alert">
          {error}
        </p>
      )}

      {(recent.length > 0 || recentError) && <p className="lq-section-label">Recent uploads</p>}
      {recentError && <p className="lq-muted">Couldn't load recent uploads.</p>}
      {recent.map((u) => (
        <button key={u.id} type="button" className="lq-invrow" onClick={() => setOpenId(u.id)}>
          <div className="lq-invrow-main">
            <span className="lq-invrow-vendor">{dayLabel(u.eventDate, u.status)}</span>
            <span className={`lq-badge lq-tg-st-${u.status}`}>{STATUS_LABEL[u.status]}</span>
          </div>
          <div className="lq-invrow-sub lq-muted">
            {u.fileNames.length ? u.fileNames.join(", ") : "Pasted text"} · {u.by} · {timeLabel(u.createdAt)}
          </div>
        </button>
      ))}

      <div className="lq-footer">
        <div className="lq-savestate" />
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>
            Exit
          </button>
          <button type="button" className="lq-btn lq-btn-primary" disabled={sending || !draft.files.length} onClick={send}>
            {sending ? "Sending…" : "Read it + email the packet"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One upload: polls while it's being read, then shows everything it did. */
function UploadResult({ id, onBack, onRetry }: { id: string; onBack: () => void; onRetry?: () => void }) {
  const [u, setU] = useState<TeacherGroupUpload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getTeacherGroupUpload(id);
        if (!alive) return;
        setU(next);
        setLoadError(null);
        if (next.status === "pending" || next.status === "processing") timer = setTimeout(poll, POLL_MS);
      } catch (e) {
        if (!alive) return;
        if (e instanceof NotAuthedError) {
          setLoadError("You've been logged out. Log back in to see this. The packet still goes out by email.");
          return;
        }
        setLoadError("Couldn't reach TPRS. Still trying…");
        timer = setTimeout(poll, POLL_MS * 2);
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (!u) {
    return loadError ? (
      <div className="lq-center">
        <p className="lq-error">{loadError}</p>
        <button type="button" className="lq-btn" onClick={onBack}>
          Back
        </button>
      </div>
    ) : (
      <div className="lq-center lq-muted">Loading…</div>
    );
  }

  const working = u.status === "pending" || u.status === "processing";
  const holding = u.issues.filter((i) => i.blocks.length > 0);
  const toSettle = u.issues.filter((i) => i.blocks.length === 0);
  const confirms = u.confirms ?? [];
  const instructions = u.instructions ?? [];
  const files = [...new Set(u.lines.map((l) => l.file))];
  const missed = u.lines.filter(unplaced).length;
  const lanesMoved = u.laneOutcomes.some((o) => o.status === "applied");

  return (
    <div className="lq-invd lq-tg">
      <button type="button" className="lq-back" onClick={onBack}>
        ‹ Teacher Group Organizer
      </button>
      <h2 className="lq-h2" style={{ textAlign: "left" }}>
        {dayLabel(u.eventDate, u.status)}
      </h2>
      <p className="lq-muted lq-invd-meta">
        Uploaded {timeLabel(u.createdAt)} · <span className={`lq-badge lq-tg-st-${u.status}`}>{STATUS_LABEL[u.status]}</span>
      </p>
      {loadError && <p className="lq-muted" role="status">{loadError}</p>}

      {working && (
        <div className="lq-tg-box" role="status">
          <p>
            <strong>Reading their sheet.</strong> Two separate reads, then the checks, the lanes and the packet. This
            usually takes a minute or two.
          </p>
          <p className="lq-muted">You can leave this screen. The packet still goes to {u.emailTo.join(", ")}.</p>
        </div>
      )}

      {u.status === "failed" && (
        <div className="lq-tg-box lq-tg-box-warn" role="alert">
          <p className="lq-error">{u.error ?? "Something went wrong."}</p>
          <p className="lq-muted">
            {lanesMoved
              ? "The lanes below were updated before it stopped, but no packet was emailed."
              : "No lanes were changed and nothing was emailed."}
          </p>
        </div>
      )}

      {u.status === "done" && (
        <p className="lq-muted">
          Emailed to {u.emailTo.join(", ")}, with a copy to Jon.
          {u.runnerTickets ? " Runner tickets included." : ""}
        </p>
      )}

      {u.laneOutcomes.length > 0 && (
        <section className="lq-tg-section">
          <h3 className="lq-tg-h3">Lanes in TPRS</h3>
          <ul className="lq-tg-list">
            {u.laneOutcomes.map((o) => (
              <li key={o.key} className="lq-tg-lane">
                <span className={`lq-badge lq-tg-st-${o.status}`}>{LANE_LABEL[o.status]}</span>
                <span>{o.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {instructions.length > 0 && (
        <section className="lq-tg-section">
          <h3 className="lq-tg-h3">Your instructions</h3>
          <ul className="lq-tg-list">
            {instructions.map((i) => (
              <li key={i.n} className={`lq-tg-line${!working && !i.applied ? " lq-tg-line-miss" : ""}`}>
                <div className="lq-tg-line-body">
                  <p className="lq-tg-line-text">{i.text}</p>
                  <p className="lq-tg-line-read">
                    {i.applied ?? (working ? "Waiting for the read…" : "Not acted on, so the lanes were held. It's on the cover sheet.")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirms.length > 0 && (
        <section className="lq-tg-section">
          <h3 className="lq-tg-h3">Confirm at the lane</h3>
          <p className="lq-muted lq-tg-help">
            Their sheet didn't say. Staff ask the team, not the organizer. These print on the kitchen and POS pages
            with a spot to circle the answer.
          </p>
          <ul className="lq-tg-list lq-tg-bullets">
            {confirms.map((c, k) => (
              <li key={k}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {holding.length > 0 && (
        <section className="lq-tg-section lq-tg-box lq-tg-box-warn">
          <h3 className="lq-tg-h3">Lanes held back because</h3>
          <ul className="lq-tg-list lq-tg-bullets">
            {holding.map((i, k) => (
              <li key={k}>{i.text}</li>
            ))}
          </ul>
        </section>
      )}

      {toSettle.length > 0 && (
        <section className="lq-tg-section">
          <h3 className="lq-tg-h3">Also on the cover sheet</h3>
          <ul className="lq-tg-list lq-tg-bullets">
            {toSettle.map((i, k) => (
              <li key={k}>{i.text}</li>
            ))}
          </ul>
        </section>
      )}

      {u.lines.length > 0 && (
        <section className="lq-tg-section">
          <h3 className="lq-tg-h3">Their sheet, line by line</h3>
          <p className="lq-muted lq-tg-help">
            {missed
              ? `${missed} line${missed === 1 ? "" : "s"} couldn't be placed. They're marked below and on the cover sheet.`
              : `All ${u.lines.length} lines were read and placed.`}
          </p>
          {files.map((file) => (
            <div key={file}>
              {files.length > 1 && <p className="lq-tg-file-head">{file}</p>}
              <ol className="lq-tg-lines">
                {u.lines
                  .filter((l) => l.file === file)
                  .map((l) => (
                    <li key={l.n} className={`lq-tg-line${unplaced(l) ? " lq-tg-line-miss" : ""}`}>
                      <span className="lq-tg-line-n">{l.n}</span>
                      <div className="lq-tg-line-body">
                        <p className="lq-tg-line-text">{l.text}</p>
                        <p className="lq-tg-line-read">
                          {unplaced(l)
                            ? `Not placed${l.reading ? ` (read as: ${l.reading})` : ""}. It's on the cover sheet.`
                            : `${KIND_LABEL[l.kind!] ?? l.kind}: ${l.reading ?? ""}`}
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      <div className="lq-footer">
        <div className="lq-savestate">{working ? "Checking every few seconds…" : ""}</div>
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onBack}>
            Back
          </button>
          {u.pdfReady ? (
            <a className="lq-btn lq-btn-primary lq-tg-linkbtn" href={teacherGroupPdfUrl(u.id)} target="_blank" rel="noopener">
              Open the packet (PDF)
            </a>
          ) : u.status === "failed" && onRetry ? (
            <button type="button" className="lq-btn lq-btn-primary" onClick={onRetry}>
              Fix it and send again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
