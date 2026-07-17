import { useEffect, useState } from "react";
import { getOpenSession, type CashActor } from "../api";

type Dest = "count" | "review" | "history" | "deposits" | "oslog";

export default function Home({ actor, onGo }: { actor: CashActor; onGo: (dest: Dest) => void }) {
  const first = (actor.displayName ?? "there").split(" ")[0];
  const [openBags, setOpenBags] = useState<number | null>(null);

  useEffect(() => {
    getOpenSession()
      .then((r) => setOpenBags(r.session ? r.bags.length : 0))
      .catch(() => setOpenBags(0));
  }, []);

  const counting = openBags != null && openBags > 0;

  return (
    <div className="lq-home">
      <p className="lq-hi">Hi, {first}.</p>
      <div className="lq-actions">
        <button type="button" className="lq-action" onClick={() => onGo("count")}>
          <span className="lq-action-emoji" aria-hidden="true">💵</span>
          <span className="lq-action-title">{counting ? "Continue counting" : "Record a count"}</span>
          <span className="lq-action-sub">
            {counting ? `${openBags} bag${openBags === 1 ? "" : "s"} counted this session` : "Pick the location, pick the day"}
          </span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("review")} disabled={!counting}>
          <span className="lq-action-emoji" aria-hidden="true">📋</span>
          <span className="lq-action-title">Review counts</span>
          <span className="lq-action-sub">
            {counting ? "Everything counted this session, over/short" : "Count some bags first"}
          </span>
        </button>

        <p className="lq-section-label">Review</p>
        <button type="button" className="lq-action" onClick={() => onGo("history")}>
          <span className="lq-action-emoji" aria-hidden="true">🗂️</span>
          <span className="lq-action-title">Past sessions</span>
          <span className="lq-action-sub">Previous count days</span>
        </button>

        {actor.isAdmin && (
          <>
            <p className="lq-section-label">Admin</p>
            <button type="button" className="lq-action" onClick={() => onGo("deposits")}>
              <span className="lq-action-emoji" aria-hidden="true">🏦</span>
              <span className="lq-action-title">Deposits</span>
              <span className="lq-action-sub">Bank confirmations — sealed vs credited</span>
            </button>
            <button type="button" className="lq-action" onClick={() => onGo("oslog")}>
              <span className="lq-action-emoji" aria-hidden="true">📒</span>
              <span className="lq-action-title">Over/short log</span>
              <span className="lq-action-sub">Monthly ledger, kept forever — CPA CSV export</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
