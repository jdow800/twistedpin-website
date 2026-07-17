import { useCallback, useEffect, useState } from "react";
// money.css is SELF-CONTAINED (lq-* base rules copied from liquor.css, mn-*
// overlay). Do NOT import ../liquor/liquor.css across the island boundary:
// the cross-tree CSS import made Vite emit a shared pure-CSS chunk whose JS
// file was elided from the build while this island's bundle still imported it
// — a 404 that killed hydration silently (blank /money, 2026-07-17).
import "./money.css";
import { getMe, logout, ForbiddenError, type CashActor } from "./api";
import Login from "./views/Login";
import Home from "./views/Home";
import CountBags from "./views/CountBags";
import Review from "./views/Review";
import History from "./views/History";
import Deposits from "./views/Deposits";

// Root island for the staff cash-counting app at twistedpin.com/money
// (spec: dev/Money Hub/BUILD-SPEC.md §4). Same shell as /liquor: auth
// bootstrap → view switch; every call same-origin via /tprs-api →
// /admin/cash/*. The PIN session is SHARED with /liquor.

type View = "loading" | "login" | "home" | "count" | "review" | "history" | "deposits" | "forbidden";

export default function MoneyApp() {
  const [view, setView] = useState<View>("loading");
  const [actor, setActor] = useState<CashActor | null>(null);

  const bootstrap = useCallback(async () => {
    setView("loading");
    try {
      const me = await getMe();
      setActor(me);
      setView("home");
    } catch (e) {
      if (e instanceof ForbiddenError) setView("forbidden");
      else setView("login");
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const doLogout = useCallback(async () => {
    await logout().catch(() => undefined);
    setActor(null);
    setView("login");
  }, []);

  const goHome = useCallback(() => setView("home"), []);

  return (
    <div className="lq-app">
      <header className="lq-header">
        <span className="lq-brand">Twisted Pin · Cash</span>
        {actor && view !== "login" && view !== "loading" && (
          <button type="button" className="lq-logout" onClick={doLogout}>
            Log out
          </button>
        )}
      </header>
      <main className="lq-main">
        {view === "loading" && <div className="lq-center lq-muted">Loading…</div>}
        {view === "login" && <Login onLoggedIn={bootstrap} />}
        {view === "forbidden" && (
          <div className="lq-center">
            <p className="lq-error">This account doesn't have cash-count access.</p>
            <p className="lq-muted" style={{ maxWidth: 320, textAlign: "center" }}>
              Ask a manager to grant the front-desk role, then log back in.
            </p>
            <button type="button" className="lq-btn" onClick={doLogout}>
              Switch user
            </button>
          </div>
        )}
        {view === "home" && actor && <Home actor={actor} onGo={(d) => setView(d)} />}
        {view === "count" && <CountBags onDone={goHome} onReview={() => setView("review")} />}
        {view === "review" && <Review onDone={goHome} />}
        {view === "history" && <History onDone={goHome} />}
        {view === "deposits" && <Deposits onDone={goHome} />}
      </main>
    </div>
  );
}
