import { useEffect, useRef, useState } from "react";
import { uploadInvoice, BarApiError, MAX_INVOICE_PAGES } from "../api";

type Pending = { file: File; url: string; id: string };

export default function UploadInvoice({ onDone }: { onDone: () => void }) {
  const [pages, setPages] = useState<Pending[]>([]);
  const [phase, setPhase] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    return () => {
      // revoke any object URLs on unmount
      pages.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_INVOICE_PAGES - pages.length;
    if (room <= 0) {
      setError(`That's the ${MAX_INVOICE_PAGES}-page max — send these, then upload another for the rest.`);
      return;
    }
    const next: Pending[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) continue;
      if (next.length >= room) break; // respect the remaining slots
      next.push({ file, url: URL.createObjectURL(file), id: `p${seq.current++}` });
    }
    if (next.length) {
      setPages((p) => [...p, ...next]);
      setError(null);
    }
  }
  function remove(id: string) {
    setPages((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });
  }

  async function send() {
    if (pages.length === 0 || phase === "uploading") return;
    setPhase("uploading");
    setError(null);
    try {
      await uploadInvoice(pages.map((p) => p.file));
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      setPages([]);
      setPhase("done");
    } catch (e) {
      setError(e instanceof BarApiError ? e.message : "Upload failed — try again.");
      setPhase("error");
    }
  }

  if (phase === "done")
    return (
      <div className="lq-center">
        <p className="lq-done-emoji" aria-hidden="true">📨</p>
        <h2 className="lq-h2">Invoice sent</h2>
        <p className="lq-muted" style={{ maxWidth: 340, textAlign: "center" }}>
          We're reading it now. If a line needs a human, the bar inbox gets an email — otherwise
          it's filed. Nothing else to do.
        </p>
        <div className="lq-voice-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>
            Home
          </button>
          <button type="button" className="lq-btn lq-btn-primary" onClick={() => setPhase("idle")}>
            Upload another
          </button>
        </div>
      </div>
    );

  return (
    <div className="lq-upload">
      <p className="lq-muted lq-upload-hint">
        Snap every page of the invoice — deposits and fees too. Multi-page: add them all before
        sending.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="lq-add-pages"
        disabled={pages.length >= MAX_INVOICE_PAGES}
        onClick={() => inputRef.current?.click()}
      >
        <span className="lq-action-emoji" aria-hidden="true">📷</span>
        <span>
          {pages.length >= MAX_INVOICE_PAGES
            ? `Max ${MAX_INVOICE_PAGES} pages`
            : pages.length
              ? `Add more pages (${pages.length}/${MAX_INVOICE_PAGES})`
              : "Add invoice pages"}
        </span>
      </button>

      {pages.length > 0 && (
        <div className="lq-thumbs">
          {pages.map((p, i) => (
            <div key={p.id} className="lq-thumb">
              <img src={p.url} alt={`page ${i + 1}`} />
              <span className="lq-thumb-num">{i + 1}</span>
              <button
                type="button"
                className="lq-thumb-x"
                aria-label={`remove page ${i + 1}`}
                onClick={() => remove(p.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="lq-error">{error}</p>}

      <div className="lq-footer">
        <div className="lq-savestate" />
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>
            Exit
          </button>
          <button
            type="button"
            className="lq-btn lq-btn-primary"
            disabled={pages.length === 0 || phase === "uploading"}
            onClick={send}
          >
            {phase === "uploading"
              ? "Sending…"
              : `Send ${pages.length || ""} page${pages.length === 1 ? "" : "s"}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
