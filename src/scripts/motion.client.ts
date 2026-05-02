/**
 * Motion One — single client-side init for hero entry, sticky CTA bar entry,
 * and nav drawer.  Keeps motion as a coherent system instead of one-off bindings.
 *
 * Reduced-motion is respected here as well as in CSS (belt-and-suspenders).
 */
import { animate } from "motion";

const reducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -----------------------------------------------------------
   Hero entry — sequential per-element fade-up.
   Each .hero-fade carries a `data-delay-ms` attribute (absolute, ms).
   Headline lines fire on a deliberate beat: line 1 with the eyebrow,
   line 2 a beat later, subhead settles after.
   ----------------------------------------------------------- */
function heroEntry(): void {
  const hero = document.querySelector("[data-hero]");
  if (!hero) return;
  const fades = Array.from(hero.querySelectorAll<HTMLElement>(".hero-fade"));
  if (fades.length === 0) return;

  const reduced = reducedMotion();
  const duration = reduced ? 0.001 : 0.5;

  fades.forEach((el) => {
    const delaySec = reduced ? 0 : Number(el.dataset.delayMs ?? 0) / 1000;
    animate(
      el,
      { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0px)"] },
      { duration, delay: delaySec, ease: [0.22, 0.61, 0.36, 1] },
    );
  });
}

/* -----------------------------------------------------------
   Sticky CTA bar entry — direction depends on viewport.
   Mobile (≤1024): slide up from below (bottom-fixed bar).
   Desktop (≥1025): slide down from above (top-fixed bar).
   The CSS initial state matches the from-keyframe per viewport, so
   pre-Motion paint also shows the bar in the right starting position.
   ----------------------------------------------------------- */
function stickyCTAEntry(): void {
  const bar = document.querySelector<HTMLElement>("[data-cta-bar]");
  if (!bar) return;
  const reduced = reducedMotion();
  const isDesktop = typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1025px)").matches;
  const fromY = isDesktop ? "-120%" : "120%";
  animate(
    bar,
    { opacity: [0, 1], transform: [`translateY(${fromY})`, "translateY(0%)"] },
    { duration: reduced ? 0.001 : 0.32, delay: reduced ? 0 : 0.55, ease: [0.22, 0.61, 0.36, 1] },
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

  const open = (): void => {
    document.body.classList.add("nav-open", "no-scroll");
    drawer.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    closeBtn.focus({ preventScroll: true });
  };
  const close = (): void => {
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
  navDrawer();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      heroEntry();
      stickyCTAEntry();
    });
  });
}
