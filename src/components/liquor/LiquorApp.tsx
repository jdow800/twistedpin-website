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
// scope and the params stripped immediately, so a logged-out staffer who has to punch
// in their PIN first still lands where the email sent them — bootstrap() doubles as
// Login's onLoggedIn, and a refresh after that goes to Home like any other session.
// ?invoice=<id> (the flagged-invoice email's "Review invoice" button) additionally
// opens that invoice's detail inside the Invoices view, and implies view=invoices
// on its own so the email URL stays short. ?count=<id> is the same idea for the
// count-report and variance-report emails — land on THAT count's detail (and its
// variance table), not on a list the reader then has to search.
const DEEP_LINKABLE: readonly View[] = ["mappours", "pourcosts", "invoices", "pricewatch", "counts"];

const { requestedView, requestedInvoiceId, requestedCountId } = ((): {
  requestedView: View | null;
  requestedInvoiceId: string | null;
  requestedCountId: string | null;
} => {
  if (typeof window === "undefined")
    return { requestedView: null, requestedInvoiceId: null, requestedCountId: null };
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  const rawInvoice = params.get("invoice");
  const rawCount = params.get("count");
  if (rawView || rawInvoice || rawCount)
    window.history.replaceState({}, "", window.location.pathname);
  const view =
    DEEP_LINKABLE.find((v) => v === rawView) ??
    (rawInvoice ? "invoices" : rawCount ? "counts" : null);
  return { requestedView: view, requestedInvoiceId: rawInvoice, requestedCountId: rawCount };
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
        {view === "invoices" && <Invoices onDone={goHome} initialInvoiceId={requestedInvoiceId} />}
        {view === "counts" && <Counts onDone={goHome} initialCountId={requestedCountId} />}
        {view === "pricewatch" && <PriceWatch onDone={goHome} />}
        {view === "pourcosts" && <PourCosts onDone={goHome} />}
        {view === "mappours" && <MapPours onDone={goHome} />}
      </main>
    </div>
  );
}
