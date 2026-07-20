import { useCallback, useEffect, useState } from "react";
import "./liquor.css";
import { getMe, logout, ForbiddenError, type BarActor } from "./api";
import Login from "./views/Login";
import Home from "./views/Home";
import CountLiquor from "./views/CountLiquor";
import KegCheck from "./views/KegCheck";
import UploadInvoice from "./views/UploadInvoice";
import Invoices from "./views/Invoices";
import Counts from "./views/Counts";
import PriceWatch from "./views/PriceWatch";
import PourCosts from "./views/PourCosts";
import MapPours from "./views/MapPours";

// Root island for the staff bar-inventory app at twistedpin.com/liquor. Owns the
// auth bootstrap (getMe → home | login | forbidden) + a tiny view switch. Every
// data call is same-origin through /tprs-api → the TPRS backend's /admin/bar/*.

type View = "loading" | "login" | "home" | "count" | "kegcheck" | "upload" | "invoices" | "counts" | "pricewatch" | "pourcosts" | "mappours" | "forbidden";

// Views an alert email is allowed to deep-link into via ?view= (e.g. the recipe-alerts
// email's "Log in and fix it" button → /liquor?view=mappours). Read once at module
// scope and the param stripped immediately, so a logged-out staffer who has to punch
// in their PIN first still lands where the email sent them — bootstrap() doubles as
// Login's onLoggedIn, and a refresh after that goes to Home like any other session.
const DEEP_LINKABLE: readonly View[] = ["mappours", "pourcosts", "invoices", "pricewatch", "counts"];

const requestedView: View | null = (() => {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("view");
  const match = DEEP_LINKABLE.find((v) => v === raw) ?? null;
  if (raw) window.history.replaceState({}, "", window.location.pathname);
  return match;
})();

export default function LiquorApp() {
  const [view, setView] = useState<View>("loading");
  const [actor, setActor] = useState<BarActor | null>(null);

  const bootstrap = useCallback(async () => {
    setView("loading");
    try {
      const me = await getMe();
      setActor(me);
      setView(requestedView ?? "home");
    } catch (e) {
      if (e instanceof ForbiddenError) setView("forbidden");
      else setView("login"); // NotAuthed / network → PIN screen
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
        <span className="lq-brand">Twisted Pin · Bar</span>
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
            <p className="lq-error">This account doesn't have bar access.</p>
            <p className="lq-muted" style={{ maxWidth: 320, textAlign: "center" }}>
              Ask a manager to grant the front-desk role, then log back in.
            </p>
            <button type="button" className="lq-btn" onClick={doLogout}>
              Switch user
            </button>
          </div>
        )}
        {view === "home" && actor && <Home actor={actor} onGo={(d) => setView(d)} />}
        {view === "count" && <CountLiquor onDone={goHome} />}
        {view === "kegcheck" && <KegCheck onDone={goHome} />}
        {view === "upload" && <UploadInvoice onDone={goHome} />}
        {view === "invoices" && <Invoices onDone={goHome} />}
        {view === "counts" && <Counts onDone={goHome} />}
        {view === "pricewatch" && <PriceWatch onDone={goHome} />}
        {view === "pourcosts" && <PourCosts onDone={goHome} />}
        {view === "mappours" && <MapPours onDone={goHome} />}
      </main>
    </div>
  );
}
