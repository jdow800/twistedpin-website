import { useState } from "react";
import { pinLogin } from "../api";

/**
 * PIN login — identical UX to /liquor (and the same backend route/session:
 * PIN in once, both staff apps are open).
 */
export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    const res = await pinLogin(pin);
    setBusy(false);
    if (res.ok) {
      onLoggedIn();
    } else {
      setError(res.message ?? "That PIN didn't match.");
      setPin("");
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  return (
    <div className="lq-login">
      <h2 className="lq-h2">Enter your PIN</h2>
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
