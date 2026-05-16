/**
 * track-clicks.client.ts — fires GA4 + Meta Pixel events on key user actions.
 *
 * Wires conversion tracking to the existing DOM. Each `trackEvent()` call
 * dispatches to both pixels in parallel:
 *   - GA4: custom event name (mark as Conversion in GA4 admin → auto-imports
 *     to Google Ads as conversion goal)
 *   - Meta Pixel: standard event vocabulary (Meta documents these for
 *     ad campaign optimization — PageView/Contact/Lead/InitiateCheckout/
 *     FindLocation are all in their official catalog)
 *
 * The actual gtag.js + fbevents.js scripts are deferred-loaded by Base.astro
 * (see "queue-immediately, fetch-late" comment there). Click events fired
 * before scripts arrive get queued and dispatched when they do.
 *
 * Matchers cover both current and reasonably-anticipated PLAN_EVENT_URL
 * destinations (Heyflow + Zite) so the toggle in src/lib/links.ts doesn't
 * break attribution. Same for /reserve which redirects to Roller.
 *
 * Init pattern matches motion.client.ts — exported initClickTracking()
 * function called from the layout's body-level <script> module.
 */

type GtagParams = Record<string, unknown>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

function trackEvent(
  ga4Event: string,
  fbEvent: string,
  params: GtagParams = {},
) {
  // Defensive typeof checks — the stubs are set up in Base.astro head, so
  // these should always be defined by the time any click fires. But if
  // a CSP / ad-blocker / privacy extension blocks the stub init, we
  // fail silently rather than throwing.
  if (typeof window.gtag === "function") {
    window.gtag("event", ga4Event, params);
  }
  if (typeof window.fbq === "function") {
    window.fbq("track", fbEvent, params);
  }
}

export function initClickTracking() {
  // Phone clicks → "phone_click" (GA4) / "Contact" (Meta).
  // Anyone clicking the phone number is a high-intent lead — they're
  // about to call or save the number.
  document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]').forEach((el) => {
    el.addEventListener("click", () =>
      trackEvent("phone_click", "Contact", { method: "phone" }),
    );
  });

  // Email clicks → "email_click" (GA4) / "Contact" (Meta).
  // Footer mailto + leagues page mailto.
  document.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]').forEach((el) => {
    el.addEventListener("click", () =>
      trackEvent("email_click", "Contact", { method: "email" }),
    );
  });

  // Reserve a Lane clicks → "reserve_lane_click" (GA4) / "InitiateCheckout" (Meta).
  // Matches both the direct Roller URL and the /reserve shortcut redirect.
  // When Roller eventually fires its own purchase event on completion, that
  // closes the loop on conversion attribution.
  document
    .querySelectorAll<HTMLAnchorElement>(
      'a[href*="ecom.roller.app"], a[href^="/reserve"]',
    )
    .forEach((el) => {
      el.addEventListener("click", () =>
        trackEvent("reserve_lane_click", "InitiateCheckout"),
      );
    });

  // Plan an Event clicks → "plan_event_click" (GA4) / "Lead" (Meta).
  // PLAN_EVENT_URL (src/lib/links.ts) toggles between:
  //   - event.twistedpin.com  (Avery OFF / Heyflow)
  //   - twistedevents.zite.so (Avery ON / Zite)
  // Matching both means the toggle doesn't break attribution.
  document
    .querySelectorAll<HTMLAnchorElement>(
      'a[href*="event.twistedpin.com"], a[href*="twistedevents.zite.so"], a[href*="heyflow"]',
    )
    .forEach((el) => {
      el.addEventListener("click", () =>
        trackEvent("plan_event_click", "Lead"),
      );
    });

  // Get Directions clicks → "directions_click" (GA4) / "FindLocation" (Meta).
  // SnapFooter's Maps deep-link + the venue address link.
  document
    .querySelectorAll<HTMLAnchorElement>('a[href*="google.com/maps"]')
    .forEach((el) => {
      el.addEventListener("click", () =>
        trackEvent("directions_click", "FindLocation"),
      );
    });
}
