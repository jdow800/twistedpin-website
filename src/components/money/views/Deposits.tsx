import { useEffect, useState } from "react";
import { bankConfirm, dollarsToCents, getDeposits, money, signedMoney, type AdminDeposit } from "../api";

/**
 * ADMIN (cash.admin — Jon only; the GM's role can't reach this route or view).
 * The deposits-vs-bank ledger: every sealed deposit, and the bank-confirmation
 * entry. Credit == sealed → banked ✓; anything else → mismatch + alert email.
 */
export default function Deposits({ onDone }: { onDone: () => void }) {
  const [deposits, setDeposits] = useState<AdminDeposit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    getDeposits()
      .then((r) => setDeposits(r.deposits))
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    void load();
  }, []);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  async function confirm(d: AdminDeposit) {
    const cents = dollarsToCents(amount);
    if (cents == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await bankConfirm(d.id, cents);
      setOpenId(null);
      setAmount("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mn-deposits">
      <div className="lq-row-between">
        <h2 className="lq-h2">Deposits · admin</h2>
        <button type="button" className="lq-btn" onClick={onDone}>← Back</button>
      </div>
      {error && <p className="lq-error">{error}</p>}
      {!deposits && !error && <p className="lq-muted">Loading…</p>}
      {deposits && deposits.length === 0 && <p className="lq-muted">No sealed deposits yet.</p>}
      {deposits && deposits.length > 0 && (
        <div className="mn-session-list">
          {deposits.map((d) => (
            <div key={d.id} className="mn-dep">
              <button type="button" className="mn-dep-head" onClick={() => { setOpenId(openId === d.id ? null : d.id); setAmount(""); }}>
                <span>{fmt.format(new Date(d.sealedAt))}</span>
                <span className="mn-dep-total">{money(d.totalCents)}</span>
                <span
                  className={
                    d.status === "banked" ? "mn-chip mn-chip-even" : d.status === "mismatch" ? "mn-chip mn-chip-short" : "mn-chip mn-chip-warn"
                  }
                >
                  {d.status === "banked" ? "✓ banked" : d.status === "mismatch" ? "⚠ mismatch" : "awaiting bank"}
                </span>
              </button>
              {openId === d.id && (
                <div className="mn-dep-body">
                  <p className="lq-muted">
                    Currency {money(d.currencyCents)} · Coin {money(d.coinCents)}
                    {d.checksCents > 0 && <> · Checks {money(d.checksCents)}</>}
                  </p>
                  {d.status === "mismatch" && d.bankCreditedCents != null && (
                    <p className="mn-short">
                      Bank credited {money(d.bankCreditedCents)} — {signedMoney(d.bankCreditedCents - d.totalCents)} vs sealed.
                    </p>
                  )}
                  {d.status === "banked" && d.bankedAt && (
                    <p className="mn-even">Confirmed {fmt.format(new Date(d.bankedAt))}.</p>
                  )}
                  <div className="mn-dep-confirm">
                    <input
                      inputMode="decimal"
                      placeholder="Bank credited $"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <button
                      type="button"
                      className="lq-btn lq-btn-primary"
                      disabled={busy || dollarsToCents(amount) == null || amount.trim() === ""}
                      onClick={() => void confirm(d)}
                    >
                      {busy ? "Saving…" : d.status === "sealed" ? "Confirm" : "Re-enter"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
