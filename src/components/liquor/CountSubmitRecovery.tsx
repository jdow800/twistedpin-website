import { useState } from "react";
import { getCountSubmissionStatus } from "./api";

/** Don't turn a lost Submit response into a second write against a closed count. */
export function CountSubmitRecovery({ sessionId, onSubmitted, onDraft, onDone }: {
  sessionId: string;
  onSubmitted: (lines: number) => void;
  onDraft: () => void;
  onDone: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  async function check() {
    if (checking) return;
    setChecking(true);
    setFailed(false);
    try {
      const status = await getCountSubmissionStatus(sessionId);
      if (status.submitted) onSubmitted(status.lineCount);
      else onDraft();
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="lq-sheet" role="dialog" aria-modal="true" aria-label="Check submission">
      <div className="lq-sheet-panel">
        <div className="lq-sheet-head">
          <h3 className="lq-h2">Did the count submit?</h3>
          <p className="lq-muted">Your counts were saved. We couldn't confirm whether Submit finished.</p>
          <p className="lq-muted">Check its status before trying to submit again. This check only reads the count.</p>
          {failed && <p className="lq-error" role="alert">Still couldn't reach the count. Check the phone's connection, then try again.</p>}
        </div>
        <div className="lq-sheet-foot">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone} disabled={checking}>Home</button>
          <button type="button" className="lq-btn lq-btn-primary" onClick={() => void check()} disabled={checking}>
            {checking ? "Checking…" : "Check submission"}
          </button>
        </div>
      </div>
    </div>
  );
}
