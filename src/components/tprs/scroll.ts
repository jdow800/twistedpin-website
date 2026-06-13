// Robust "scroll the page to its true bottom" used after actions that BOTH add
// content and resize the fixed cart bar (pick a time → reveal "How many lanes?";
// expand the cart). The naive single-rAF scroll lands short because the cart's
// ResizeObserver updates `--tprs-cart-h` (→ page padding) AFTER layout, so the
// first measured scrollHeight is stale. A double rAF waits past that reflow, and
// we re-read scrollHeight at scroll time so we hit the real bottom every time.
//
// Because the page's bottom padding tracks the cart height, landing at the true
// bottom places the last content (e.g. the lane stepper) cleanly ABOVE the bar —
// collapsed or expanded — so nothing hides behind it.

export function scrollPageToBottom(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    });
  });
}

/** Scroll a field clear of the fixed site header (top) and, on mobile, the
 *  fixed cart bar (bottom), then focus it — the "what did I miss?" fix: a
 *  failed Continue jumps the guest straight to the first unfilled field.
 *  Double-rAF-deferred so we measure AFTER the reveal-all re-render commits +
 *  paints (revealed error rows push the fields below the first one down).
 *  Honors reduced-motion. No-ops safely if the id isn't found (e.g. a dormant
 *  form group field with no id on a focusable control). */
export function scrollFocusInvalid(domId: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(domId);
      if (!el) return;
      // Measure the REAL fixed header (.site-chrome) — its height tracks the
      // responsive logo (~62px mobile / ~83px desktop). The static
      // --header-height token (64) under-reports the taller desktop header, so
      // trusting it would tuck the focused field ~3px under the bar; the token
      // is only the fallback if the node is somehow missing.
      const chrome = document.querySelector(".site-chrome");
      const cs = getComputedStyle(document.documentElement);
      const headerH = chrome
        ? chrome.getBoundingClientRect().height
        : parseInt(cs.getPropertyValue("--header-height")) || 64;
      // The cart overlaps content only on mobile (fixed bottom bar < 1025px);
      // on desktop it's a sticky in-flow rail → no bottom overlap.
      const cartH =
        window.innerWidth < 1025
          ? parseInt(cs.getPropertyValue("--tprs-cart-h")) || 150
          : 0;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      const rect = el.getBoundingClientRect();
      const topPad = headerH + 16;
      const bottomLimit = window.innerHeight - cartH - 16;

      // Only scroll if the field is actually clipped by either fixed bar.
      if (rect.top < topPad || rect.bottom > bottomLimit) {
        window.scrollTo({
          top: window.scrollY + rect.top - topPad,
          behavior: reduce ? "auto" : "smooth",
        });
      }
      // We placed it precisely — don't let focus() re-scroll it under the header.
      // (iOS Safari ≤14.0 ignores preventScroll; worst case is a cosmetic re-jog
      // of an already-focused field — accepted for that sub-0.1% browser.)
      el.focus({ preventScroll: true });
    });
  });
}
