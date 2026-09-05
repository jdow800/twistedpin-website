import { useCallback, useEffect, useState } from "react";
import "./liquor.css";
import { getMe, logout, ForbiddenError, SECTIONS, type BarActor, type Section } from "./api";
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
import RecipeBuilder from "./views/RecipeBuilder";

// Root island for the staff bar-inventory app at twistedpin.com/liquor. Owns the
// auth bootstrap (getMe → home | login | forbidden) + a tiny view switch. Every
// data call is same-origin through /tprs-api → the TPRS backend's /admin/bar/*.

type View = "loading" | "login" | "home" | "count" | "kegcheck" | "upload" | "invoices" | "counts" | "pricewatch" | "pourcosts" | "mappours" | "recipes" | "forbidden";

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
const DEEP_LINKABLE: readonly View[] = ["mappours", "recipes", "pourcosts", "invoices", "pricewatch", "counts"];

// Which catalog the app is working in (BUILD-SPEC decision 6 / migration 0166).
// ABSENT MEANS 'bar', and that default is load-bearing rather than a
// convenience: six alert-email templates have been sending
// /liquor?count=<uuid> and ?view=<v> links for weeks, those live in Jon's
// inbox, and /liquor now 301s here carrying its query string. Anything that
// made an unspecified section ambiguous would break every one of them.
//
// P0 is plumbing only, so nothing reads this yet beyond passing it to the API.
// It is parsed here so the URL contract is fixed BEFORE food views exist and
// the first food email is ever sent.
export type { Section };

const { requestedView, requestedInvoiceId, requestedCountId, requestedSection } = ((): {
  requestedView: View | null;
  requestedInvoiceId: string | null;
  requestedCountId: string | null;
  requestedSection: Section;
} => {
  if (typeof window === "undefined")
    return {
      requestedView: null,
      requestedInvoiceId: null,
      requestedCountId: null,
      requestedSection: "bar",
    };
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  const rawInvoice = params.get("invoice");
  const rawCount = params.get("count");
  const rawSection = params.get("section");
  if (rawView || rawInvoice || rawCount || rawSection)
    window.history.replaceState({}, "", window.location.pathname);
  const view =
    DEEP_LINKABLE.find((v) => v === rawView) ??
    (rawInvoice ? "invoices" : rawCount ? "counts" : null);
  // An unrecognised value falls back to 'bar' rather than erroring: a typo in
  // a hand-edited URL should land somewhere real, and 'bar' is the only
  // section that has any views at all in P0.
  const section = SECTIONS.find((x) => x === rawSection) ?? "bar";
  return {
    requestedView: view,
    requestedInvoiceId: rawInvoice,
    requestedCountId: rawCount,
    requestedSection: section,
  };
})();

/**
 * The section this tab is working in. Read once from the URL, then fixed for
 * the life of the tab — the catalog, the zone list and (in phase 1) the count
 * session all hang off it, and letting it change under a half-entered count
 * would silently re-point rows at the other catalog.
 */
export function activeSection(): Section {
  return requestedSection;
}

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
        {view === "recipes" && <RecipeBuilder onDone={goHome} />}
      </main>
    </div>
  );
}
