import { useEffect, useState } from "react";
import { getOpenSession, type CashActor } from "../api";

type Dest = "count" | "review" | "history";

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
          <span className="lq-action-title">{counting ? "Continue counting" : "Begin counting"}</span>
          <span className="lq-action-sub">
            {counting ? `${openBags} bag${openBags === 1 ? "" : "s"} counted this session` : "Open the safe, pick a bag"}
          </span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("review")} disabled={!counting}>
          <span className="lq-action-emoji" aria-hidden="true">🏦</span>
          <span className="lq-action-title">Review &amp; seal deposit</span>
          <span className="lq-action-sub">
            {counting ? "Over/short recap → total to bank" : "Count some bags first"}
          </span>
        </button>

        <p className="lq-section-label">Review</p>
        <button type="button" className="lq-action" onClick={() => onGo("history")}>
          <span className="lq-action-emoji" aria-hidden="true">📋</span>
          <span className="lq-action-title">Past deposits</span>
          <span className="lq-action-sub">Sealed count sessions</span>
        </button>
      </div>
    </div>
  );
}
