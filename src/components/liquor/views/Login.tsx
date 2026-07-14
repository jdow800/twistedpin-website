import { useEffect, useState } from "react";
import { listPinUsers, pinLogin, type PinUser } from "../api";

/**
 * PIN login: tap your name tile, key your PIN. On success the backend sets the
 * staff session cookie; we call onLoggedIn so the app re-bootstraps (fetches the
 * full actor + permissions).
 */
export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [users, setUsers] = useState<PinUser[] | null>(null);
  const [selected, setSelected] = useState<PinUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listPinUsers()
      .then((u) => live && setUsers(u))
      .catch(() => live && setUsers([]));
    return () => {
      live = false;
    };
  }, []);

  async function submit() {
    if (!selected || pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    const res = await pinLogin(selected.id, pin);
    setBusy(false);
    if (res.ok) {
      onLoggedIn();
    } else {
      setError(res.message ?? "That PIN didn't match.");
      setPin("");
    }
  }

  if (users === null) {
    return <div className="lq-center lq-muted">Loading…</div>;
  }
  if (users.length === 0) {
    return (
      <div className="lq-center">
        <p className="lq-muted" style={{ maxWidth: 360, textAlign: "center" }}>
          No staff PINs are set up yet. Ask a manager to add your PIN before you can count.
        </p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="lq-login">
        <h2 className="lq-h2">Who's counting?</h2>
        <div className="lq-tiles">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className="lq-tile"
              onClick={() => {
                setSelected(u);
                setPin("");
                setError(null);
              }}
            >
              {u.displayName}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  return (
    <div className="lq-login">
      <button type="button" className="lq-back" onClick={() => setSelected(null)}>
        ← Not you?
      </button>
      <h2 className="lq-h2">{selected.displayName}</h2>
      <div className="lq-pin-dots" aria-label="PIN entry">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={i < pin.length ? "lq-dot lq-dot-on" : "lq-dot"} />
        ))}
      </div>
      {error && <p className="lq-error">{error}</p>}
      <div className="lq-numpad">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className={`lq-key${k === "clear" || k === "back" ? " lq-key-alt" : ""}`}
            onClick={() => {
              setError(null);
              if (k === "clear") setPin("");
              else if (k === "back") setPin((p) => p.slice(0, -1));
              else if (pin.length < 8) setPin((p) => p + k);
            }}
          >
            {k === "back" ? "⌫" : k === "clear" ? "clear" : k}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="lq-btn lq-btn-primary lq-btn-wide"
        disabled={pin.length < 4 || busy}
        onClick={submit}
      >
        {busy ? "Checking…" : "Enter"}
      </button>
    </div>
  );
}
