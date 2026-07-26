import { useCallback, useEffect, useState } from "react";
import { pinLogin } from "../api";

/**
 * PIN login — same UX and same backend route as /liquor and /money (PIN in
 * once, every staff app is open), with one addition: THE KEYBOARD WORKS.
 *
 * The liquor/money pads are tap-only, which is right on the phone at the desk
 * and wrong on a laptop — Jon hit exactly that ("I see the pin now it didn't let
 * me enter it"). Digits, Backspace, Escape and Enter are all bound here, so the
 * pad is a convenience rather than the only way in.
 *
 * Own copy rather than importing the liquor one, matching how /money does it:
 * each island stays self-contained so nothing crosses the island boundary
 * (MoneyApp documents a real Vite failure from a cross-tree import).
 */
export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (candidate: string) => {
      if (candidate.length < 4 || busy) return;
      setBusy(true);
      setError(null);
      const res = await pinLogin(candidate);
      setBusy(false);
      if (res.ok) onLoggedIn();
      else {
        setError(res.message ?? "That PIN didn't match.");
        setPin("");
      }
    },
    [busy, onLoggedIn],
  );

  // Physical keyboard: type the PIN, Enter to submit. Bound on window because
  // there is no focusable input to hang it off (the dots aren't an <input> —
  // a real field would invite autofill and a visible PIN).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (/^[0-9]$/.test(e.key)) {
        setError(null);
        setPin((p) => (p.length < 8 ? p + e.key : p));
      } else if (e.key === "Backspace") {
        setError(null);
        setPin((p) => p.slice(0, -1));
      } else if (e.key === "Escape") {
        setPin("");
      } else if (e.key === "Enter") {
        void submit(pin);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `pin` is a dependency so Enter submits the CURRENT value — re-binding on
    // each keystroke is cheap, and reading it out of a state updater instead
    // would be an impure reducer that double-fires under StrictMode.
  }, [busy, pin, submit]);

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
              else setPin((p) => (p.length < 8 ? p + k : p));
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
        onClick={() => void submit(pin)}
      >
        {busy ? "Checking…" : "Enter"}
      </button>
      <p className="lq-muted lb-kbdhint">Or just type it and press Enter.</p>
    </div>
  );
}
