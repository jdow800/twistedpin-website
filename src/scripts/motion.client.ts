/**
 * Motion One — single client-side init for hero entry, sticky CTA bar entry,
 * and nav drawer.  Keeps motion as a coherent system instead of one-off bindings.
 *
 * Reduced-motion is respected here as well as in CSS (belt-and-suspenders).
 */
import { animate } from "motion";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -----------------------------------------------------------
   Hero entry stagger — eyebrow → headline → subhead → CTA.
   Fires when the hero media has settled (poster paint or video metadata).
   ----------------------------------------------------------- */
function heroEntry(): void {
  const hero = document.querySelector("[data-hero]");
  if (!hero) return;
  const fades = Array.from(hero.querySelectorAll<HTMLElement>(".hero-fade"));
  if (fades.length === 0) return;

  fades.sort((a, b) => Number(a.dataset.fadeOrder ?? 0) - Number(b.dataset.fadeOrder ?? 0));

  const reduced = reducedMotion();
  const stagger = reduced ? 0 : 0.08;
  const duration = reduced ? 0.001 : 0.45;

  fades.forEach((el, i) => {
    animate(
      el,
      { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0px)"] },
      { duration, delay: i * stagger, ease: [0.22, 0.61, 0.36, 1] },
    );
  });
}

/* -----------------------------------------------------------
   Sticky CTA bar entry — slide up from below on first paint.
   ----------------------------------------------------------- */
function stickyCTAEntry(): void {
  const bar = document.querySelector<HTMLElement>("[data-cta-bar]");
  if (!bar) return;
  const reduced = reducedMotion();
  animate(
    bar,
    { opacity: [0, 1], transform: ["translateY(120%)", "translateY(0%)"] },
    { duration: reduced ? 0.001 : 0.32, delay: reduced ? 0 : 0.45, ease: [0.22, 0.61, 0.36, 1] },
  );
}

/* -----------------------------------------------------------
   Nav drawer — open/close. CSS handles the slide; JS toggles classes
   and manages focus + scroll lock.
   ----------------------------------------------------------- */
function navDrawer(): void {
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
  const drawer = document.querySelector<HTMLElement>("[data-nav-drawer]");
  const backdrop = document.querySelector<HTMLElement>("[data-nav-backdrop]");
  const closeBtn = document.querySelector<HTMLButtonElement>("[data-nav-close]");
  if (!toggle || !drawer || !backdrop || !closeBtn) return;

  const open = () => {
    document.body.classList.add("nav-open", "no-scroll");
    drawer.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    closeBtn.focus({ preventScroll: true });
  };
  const close = () => {
    document.body.classList.remove("nav-open", "no-scroll");
    drawer.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus({ preventScroll: true });
  };

  toggle.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("nav-open")) close();
  });
}

/* -----------------------------------------------------------
   Boot
   ----------------------------------------------------------- */
export function initMotion(): void {
  if (typeof window === "undefined") return;

  // Wire interactions immediately.
  navDrawer();

  // Defer hero/CTA entry until the layout is painted so the stagger fires
  // on top of a stable first frame, not a layout-shift one.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      heroEntry();
      stickyCTAEntry();
    });
  });
}
