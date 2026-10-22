import { useEffect, useRef, type ReactNode } from "react";
import "./brand.css";
import {nyeEventConfig,type EventBookingIdentity} from "./eventConfig";

export type BrandStep = "lanes" | "time" | "arcade" | "food" | "pay" | "confirmation";

const STEPS: { id: BrandStep; label: string }[] = [
  { id: "lanes", label: "Lanes" },
  { id: "time", label: "Party time" },
  { id: "arcade", label: "Arcade" },
  { id: "food", label: "Food & details" },
  { id: "pay", label: "Review & pay" },
];

export interface BrandShellProps {
  step: BrandStep;
  children: ReactNode;
  locked?: boolean;
  onNavigate?: (step: BrandStep) => void;
  canNavigate?: (step: BrandStep) => boolean;
  onBack?: () => void;
  summary: { caption: string; value: ReactNode; note?: ReactNode };
  primary?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
  contextLabel?: ReactNode;
  /** The controller owns the server expiry and hold/accepted-payment distinction. */
  holdStatus?: ReactNode;
  notice?: ReactNode;
  previewNotice?: ReactNode;
  /** ISO calendar date. Formatting deliberately avoids the browser's timezone. */
  eventDate?: string;
  identity?: EventBookingIdentity;
  onViewSummary?: () => void;
  summaryExpanded?: boolean;
  footerSecondary?: ReactNode;
  /** Optional arcade action must remain visually secondary when nothing was added. */
  secondaryPrimary?: boolean;
}

/** NYE presentation only. The parent retains draft, inventory, validation and payment ownership. */
export default function BrandShell({
  step, children, locked = false, onNavigate, canNavigate, onBack,
  summary, primary, contextLabel, holdStatus, notice, previewNotice,
  eventDate = "2026-12-31", identity=nyeEventConfig.identity, onViewSummary, summaryExpanded, footerSecondary,
  secondaryPrimary = false,
}: BrandShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const index = STEPS.findIndex((item) => item.id === step);
  const terminal = step === "confirmation";
  const date = new Date(`${eventDate}T12:00:00Z`);
  const validDate = Number.isFinite(date.getTime());
  const year = validDate ? date.getUTCFullYear() : 2026;
  const longDate = validDate ? new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date) : eventDate;
  const shortDate = validDate ? new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date) : eventDate;

  useEffect(() => {
    const measure = () => {
      shellRef.current?.style.setProperty("--footer-space", `${(footerRef.current?.getBoundingClientRect().height ?? 0) + 32}px`);
      shellRef.current?.style.setProperty("--banner-height", `${bannerRef.current?.getBoundingClientRect().height ?? 0}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (footerRef.current) observer.observe(footerRef.current);
    if (bannerRef.current) observer.observe(bannerRef.current);
    return () => observer.disconnect();
  }, [terminal, previewNotice]);

  function allowed(target: BrandStep) {
    return !locked && !!onNavigate && !!canNavigate?.(target);
  }
  // Reading the accepted summary is safe even while payment owns the flow.
  // This scroll action never navigates, unlocks or submits the reservation.
  const viewSummary = onViewSummary ?? (step === "pay" ? () => {
    const heading = shellRef.current?.querySelector<HTMLElement>(".page-heading, .tprs-h2");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  } : undefined);

  return <div className={`nye-brand${identity.theme==='jingle'?' jingle-booking':''}`} ref={shellRef}>
    {previewNotice && <div className="brand-preview-notice" ref={bannerRef}>{previewNotice}</div>}
    <header className="mobile-brand">
      <div className="brand-top">
        <img src="/logo/twisted-pin-horizontal-white.webp" alt="Twisted Pin" width="137" height="45" />
        <div className="mobile-date">{identity.name.toUpperCase()}<strong>{shortDate.toUpperCase()}</strong></div>
      </div>
      <div className="mobile-progress">
        <button className="mobile-back" type="button" hidden={!onBack || terminal} disabled={locked} onClick={onBack}>
          <span aria-hidden="true">←</span> Back
        </button>
        <button className="mobile-context" type="button" disabled={!allowed("time") || terminal}
          onClick={() => onNavigate?.("time")} aria-label="Review your lane and party time selection">
          {contextLabel ?? (identity.theme==='nye'?"Your New Year's reservation":`Your ${identity.name} reservation`)}
        </button>
        {!terminal && <span className="mobile-step" aria-label={`Step ${index + 1} of ${STEPS.length}`}>{index + 1} / {STEPS.length}</span>}
      </div>
    </header>
    <div className="shell">
      <aside className="identity" aria-label={`${identity.name} at Twisted Pin`}>
        <img className="identity-photo" src={identity.photo} alt="Guests bowling at Twisted Pin" width="1080" height="720" />
        <div className="identity-copy">
          <img className="logo" src="/logo/twisted-pin-horizontal-white.webp" alt="Twisted Pin" width="178" height="70" />
          <p className="date-line">{longDate.toUpperCase()}</p>
          <h1>{identity.headline.map(line=><span key={line}>{line}</span>)}</h1>
          <p className="invitation">{identity.invitation.map((line,i)=><span key={line}>{line}{i<identity.invitation.length-1&&<br/>}</span>)}</p>
          <div className="identity-bottom"><div className="identity-rule" /><span className="caps">{identity.name} at Twisted Pin</span>
            <p>{identity.closing.map((line,i)=><span key={line}>{line}{i<identity.closing.length-1&&<br/>}</span>)}</p>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="flow" id="nye-brand-main">
          {!terminal && <nav className="progress" aria-label="Booking steps">
            {STEPS.map((item, i) => <button key={item.id} type="button"
              className={i < index ? "complete" : undefined}
              aria-current={item.id === step ? "step" : undefined}
              disabled={!allowed(item.id)} onClick={() => onNavigate?.(item.id)}>
              <span className="num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>{item.label}
            </button>)}
          </nav>}
          {holdStatus && <div className="hold-status">{holdStatus}</div>}
          {notice}
          {children}
        </div>
        {!terminal && <footer className={`checkout-footer${secondaryPrimary ? " is-arcade-empty" : ""}`} ref={footerRef}>
          <div className="footer-inner">
            <div className="footer-price">
              <span className="caption">{summary.caption}</span>
              <strong>{summary.value}</strong>
              {summary.note && <span className="price-note">{summary.note}</span>}
              {viewSummary && <button className="view-summary" type="button" onClick={viewSummary} aria-expanded={summaryExpanded}>View summary</button>}
            </div>
            <div className="footer-actions">
              {onBack && <button className="back" type="button" disabled={locked} onClick={onBack}>Back</button>}
              {primary && <button className="primary brand-continue" type="button" disabled={locked || primary.disabled || primary.busy}
                aria-busy={primary.busy || undefined} onClick={primary.onClick}>
                <span className="brand-continue-label">{primary.label}</span><span className="arrow" aria-hidden="true">→</span>
              </button>}
              {footerSecondary}
            </div>
          </div>
        </footer>}
      </div>
    </div>
  </div>;
}
