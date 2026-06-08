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
