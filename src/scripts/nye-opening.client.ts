import { NYE_OPENING_AT, NYE_EVENT_END_AT, NYE_OPEN_CTA, NYE_ENDED_CTA, NYE_ENDED_HEADER_CTA } from "../config/nye-opening.ts";

const opensAt = Date.parse(NYE_OPENING_AT);
const endsAt = Date.parse(NYE_EVENT_END_AT);
const MAX_TIMEOUT_MS = 2_147_483_647;
type NyeOpeningPhase = "before" | "open" | "ended";

/** Explicit UTC instants keep the Chicago schedule independent of browser TZ. */
export function nyeOpeningState(now = Date.now()) {
  const phase: NyeOpeningPhase = now >= endsAt ? "ended" : now >= opensAt ? "open" : "before";
  const seconds = Math.max(0, Math.ceil((opensAt - now) / 1000));
  return {
    phase,
    days: Math.floor(seconds / 86400),
    hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
  };
}

/** Presentation only: no request, reservation, automatic navigation or stock claim. */
export function mountNyeOpening(doc: Document = document): () => void {
  const cards = [...doc.querySelectorAll<HTMLElement>("[data-nye-opening]")];
  const win = doc.defaultView;
  if (!cards.length || !win) return () => {};
  const reminders = [...doc.querySelectorAll<HTMLElement>("[data-nye-opening-reminder]")]
    .map(element => ({ element, before: element.textContent ?? "" }));
  let timer: number | undefined;
  let previousPhase: NyeOpeningPhase | undefined;

  const stopTimer = () => {
    if (timer !== undefined) win.clearTimeout(timer);
    timer = undefined;
  };

  const update = () => {
    stopTimer();
    const now = Date.now();
    const state = nyeOpeningState(now);
    for (const card of cards) {
      card.dataset.nyeState = state.phase;
      const countdown = card.querySelector<HTMLElement>("[data-nye-countdown]");
      if (countdown) {
        if (state.phase === "before") {
          for (const unit of ["days", "hours", "minutes", "seconds"] as const) {
            const number = countdown.querySelector<HTMLElement>(`[data-nye-unit="${unit}"]`);
            if (number) number.textContent = String(state[unit]).padStart(2, "0");
          }
        }
        countdown.hidden = state.phase !== "before";
      }
      // Only the meaningful phase change reaches the live region, never ticks.
      if (state.phase !== previousPhase) {
        const heading = card.querySelector<HTMLElement>("[data-nye-opening-heading]");
        if (heading) heading.textContent = state.phase === "before" ? "Reservations open"
          : state.phase === "open" ? "NYE reservations" : "NYE 2026";
        const openingDate = card.querySelector<HTMLElement>("[data-nye-opening-date]");
        if (openingDate) openingDate.hidden = state.phase !== "before";
        const eventDate = card.querySelector<HTMLElement>("[data-nye-event-date]");
        if (eventDate) eventDate.hidden = state.phase === "before";
        const status = card.querySelector<HTMLElement>("[data-nye-status]");
        if (status) {
          status.textContent = state.phase === "open" ? "Choose your party time."
            : state.phase === "ended" ? "This New Year's Eve event has ended." : "";
          status.hidden = state.phase === "before";
        }
      }
    }
    if (state.phase !== previousPhase) {
      for (const element of doc.querySelectorAll<HTMLElement>("[data-nye-open-only]")) element.hidden = state.phase !== "open";
      for (const element of doc.querySelectorAll<HTMLElement>("[data-nye-before-only]")) element.hidden = state.phase !== "before";
      for (const element of doc.querySelectorAll<HTMLElement>("[data-nye-after-opening]")) element.hidden = state.phase === "before";
      for (const { element, before } of reminders) {
        element.textContent = state.phase === "before" ? before : state.phase === "open"
          ? "Choose your party time and lane type." : "New Year’s Eve 2026 has ended.";
      }
      for (const anchor of doc.querySelectorAll<HTMLAnchorElement>("a[data-nye-booking-cta], a[data-reservation-action]")) {
        const header = anchor.hasAttribute("data-reservation-action");
        const cta = state.phase !== "ended" ? NYE_OPEN_CTA : header ? NYE_ENDED_HEADER_CTA : NYE_ENDED_CTA;
        anchor.setAttribute("href", cta.href);
        const label = anchor.querySelector<HTMLElement>("[data-reservation-action-label], [data-nye-booking-cta-label]");
        (label ?? anchor).textContent = cta.label;
        if (anchor.hasAttribute("aria-label")) anchor.setAttribute("aria-label", cta.label);
      }
      previousPhase = state.phase;
    }
    if (doc.visibilityState === "hidden" || state.phase === "ended") return;
    // Per-second work stops at opening. One bounded deadline wake-up still lets
    // an unusually long-lived tab retire NYE links when the final party ends.
    const delay = state.phase === "before" ? Math.min(1000, opensAt - now) : Math.min(MAX_TIMEOUT_MS, endsAt - now);
    timer = win.setTimeout(update, delay);
  };

  doc.addEventListener("visibilitychange", update);
  win.addEventListener("pageshow", update);
  win.addEventListener("focus", update);
  update();
  return () => {
    stopTimer();
    doc.removeEventListener("visibilitychange", update);
    win.removeEventListener("pageshow", update);
    win.removeEventListener("focus", update);
  };
}

if (typeof document !== "undefined") mountNyeOpening();
