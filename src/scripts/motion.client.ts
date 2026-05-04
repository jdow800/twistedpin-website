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
   Sticky CTA bar entry — slides up from below.
   Bar is mobile-only (display: none on ≥1025); desktop CTAs live in the
   persistent SiteHeader. So the entry direction is unconditionally
   bottom-up — no viewport check needed.
   ----------------------------------------------------------- */
function stickyCTAEntry(): void {
  const bar = document.querySelector<HTMLElement>("[data-cta-bar]");
  if (!bar) return;
  const reduced = reducedMotion();
  animate(
    bar,
    { opacity: [0, 1], transform: ["translateY(120%)", "translateY(0%)"] },
    { duration: reduced ? 0.001 : 0.32, delay: reduced ? 0 : 0.55, ease: [0.22, 0.61, 0.36, 1] },
  );
}

/* -----------------------------------------------------------
   Section video — single-active-video rule across `[data-section-video]`
   elements. Ratio > 0.5 plays; below pauses. Math note: with stacked
   sections summing > 100vh in height, only one section can have
   intersection ratio > 0.5 at a time, so mutual exclusivity falls out
   of the geometry — no central state manager needed.

   Lazy-source promotion: any source with `data-src` (instead of `src`)
   is promoted as soon as the video has *any* visibility (ratio > 0).
   Bytes don't load until the user is approaching the section.

   Mute is enforced on every state transition — audio collision is
   structurally impossible regardless of future "should this have sound?"
   decisions on individual videos.
   ----------------------------------------------------------- */
function sectionVideo(): void {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-section-video]"));
  if (videos.length === 0) return;

  const reduced = reducedMotion();
  if (reduced) {
    // Reduced motion: no autoplay anywhere; show the poster only.
    videos.forEach((v) => {
      v.removeAttribute("autoplay");
      try { v.pause(); } catch { /* not yet ready, fine */ }
    });
    return;
  }

  const enforceMute = (v: HTMLVideoElement): void => { v.muted = true; };

  const promoteLazySources = (v: HTMLVideoElement): void => {
    if (v.dataset.sourcesPromoted === "true") return;
    let promoted = false;
    v.querySelectorAll<HTMLSourceElement>("source[data-src]").forEach((s) => {
      const src = s.getAttribute("data-src");
      if (src) { s.setAttribute("src", src); promoted = true; }
    });
    if (promoted) {
      v.dataset.sourcesPromoted = "true";
      v.load();
    }
  };

  const playOne = (v: HTMLVideoElement): void => {
    enforceMute(v);
    promoteLazySources(v);
    v.play().catch(() => { /* autoplay blocked; poster shows */ });
  };

  const isMostlyInView = (v: HTMLVideoElement): boolean => {
    const r = v.getBoundingClientRect();
    if (r.height === 0) return false;
    const vh = window.innerHeight;
    const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return visible / r.height > 0.5;
  };

  // Initial state — enforce mute everywhere; pause anything not mostly in view.
  videos.forEach((v) => {
    enforceMute(v);
    if (!isMostlyInView(v)) {
      try { v.pause(); } catch { /* not yet ready */ }
    }
  });

  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.intersectionRatio > 0) promoteLazySources(v);
          if (e.intersectionRatio >= 0.5) playOne(v);
          else v.pause();
        }
      },
      { threshold: [0, 0.5] },
    );
    videos.forEach((v) => obs.observe(v));
  }

  // Scroll-listener fallback. window covers desktop long-scroll; .snap covers
  // the mobile container's own overflow scrollport.
  const onScroll = (): void => {
    for (const v of videos) {
      if (isMostlyInView(v)) playOne(v);
      else { try { v.pause(); } catch { /* */ } }
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  const snapEl = document.querySelector<HTMLElement>(".snap");
  if (snapEl) snapEl.addEventListener("scroll", onScroll, { passive: true });
}

/* -----------------------------------------------------------
   Section reveal — fade-up on scroll-into-view, once per element.
   Used by /snap-test/ desktop track (Phase 2A) for `[data-reveal]`
   markers. Defensive against the documented IO flakiness in headless
   preview environments: belt + suspenders with window scroll, .snap
   scroll, AND an immediate-visible check at boot.
   ----------------------------------------------------------- */
function sectionReveal(): void {
  const reveals = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (reveals.length === 0) return;

  const reduced = reducedMotion();
  if (reduced) {
    // CSS already shows them via the prefers-reduced-motion media query.
    // Belt + suspenders: clear inline styles in case anything left them set.
    reveals.forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    return;
  }

  const reveal = (el: HTMLElement): void => {
    if (el.dataset.revealed === "true") return;
    el.dataset.revealed = "true";
    animate(
      el,
      { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0px)"] },
      { duration: 0.45, ease: [0.22, 0.61, 0.36, 1] },
    );
  };

  const isInView = (el: HTMLElement): boolean => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    // Trigger when ~10% of the element is on-screen at the bottom edge.
    return r.top < vh * 0.9 && r.bottom > 0;
  };

  // Fire immediately for elements already in view at boot — covers cases
  // where IO never observes (headless previews) and where the user lands
  // mid-page (back-button, anchor link).
  reveals.forEach((el) => { if (isInView(el)) reveal(el); });

  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal(e.target as HTMLElement);
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    reveals.forEach((el) => { if (el.dataset.revealed !== "true") obs.observe(el); });
  }

  // Scroll-listener fallback. window covers desktop long-scroll; .snap
  // covers the mobile container (its own overflow scrollport) where window
  // scroll never fires.
  const onScroll = (): void => {
    for (const el of reveals) {
      if (el.dataset.revealed !== "true" && isInView(el)) reveal(el);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  const snapEl = document.querySelector<HTMLElement>(".snap");
  if (snapEl) snapEl.addEventListener("scroll", onScroll, { passive: true });
}

/* -----------------------------------------------------------
   Sticky CTA bar — hide when SnapFooter is the dominant section
   in view (>50% intersection). Adds/removes `body.snap-cta-hidden`;
   the global rule in global.css fades the bar out smoothly.

   Lifted from index.astro inline (2026-05-04) so /bar, /eat, and
   every future page including SnapFooter inherit the same auto-hide
   behavior. Belt + suspenders: IntersectionObserver covers window
   scroll on inner pages; the .snap container scroll-listener
   covers the homepage where window scroll never fires (the .snap
   element is the actual scroll container on /).
   ----------------------------------------------------------- */
function snapFooterCTAHide(): void {
  const footer = document.querySelector<HTMLElement>(".snap-footer");
  if (!footer) return;

  const toggleHide = (hide: boolean): void => {
    document.body.classList.toggle("snap-cta-hidden", hide);
  };

  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) toggleHide(e.intersectionRatio > 0.5);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    obs.observe(footer);
  }

  // Scroll-listener fallback. window covers desktop / inner-page long-scroll;
  // .snap covers the homepage's container scrollport.
  const onScroll = (): void => {
    const rect = footer.getBoundingClientRect();
    const vh = window.innerHeight;
    const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    toggleHide(visible / vh > 0.5);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  const snapEl = document.querySelector<HTMLElement>(".snap");
  if (snapEl) snapEl.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
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
      snapFooterCTAHide();
      sectionReveal();
      sectionVideo();
    });
  });
}
