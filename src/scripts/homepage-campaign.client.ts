import { homepagePromotions } from "../config/homepage-campaigns";

/** Homepage-only controller. No storage, booking requests or new video sources. */
export function initHomepagePromotions() {
  const found = document.querySelector<HTMLElement>("[data-homepage-promotions]");
  if (!found || found.dataset.initialized) return;
  const root: HTMLElement = found;
  root.dataset.initialized = "true";
  const invitation = root.querySelector<HTMLElement>("[data-homepage-nye]")!;
  const fallback = root.querySelector<HTMLElement>("[data-homepage-fallback]")!;
  const slides = Array.from(fallback.querySelectorAll<HTMLAnchorElement>("[data-promo-slide]"));
  const pause = root.querySelector<HTMLButtonElement>("[data-homepage-nye-pause]")!;
  const hero = document.querySelector<HTMLElement>("[data-hero]")!;
  const chrome = document.querySelector<HTMLElement>(".site-chrome");
  const videos = Array.from(hero.querySelectorAll<HTMLVideoElement>("video"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  // Very short phone landscape has no space between the original header and
  // headline. Preserve that hero instead of covering it with an invitation.
  const cramped = matchMedia("(max-height: 360px) and (min-width: 500px) and (max-width: 1024px)");
  let ready = reduced.matches, dismissed = false, genericDismissed = false, started = false, paused = false;
  let campaignActive = false, genericHover = false, activeIndex = 0, genericKey = "", nextRotation = 0;
  let timer: ReturnType<typeof setTimeout>;
  const pausedByUs = new Set<HTMLVideoElement>();
  const heroVisible = () => { const r = hero.getBoundingClientRect(); return r.bottom > innerHeight / 2 && r.top < innerHeight / 2; };
  const stopHero = () => campaignActive && !dismissed && !cramped.matches && (paused || reduced.matches || document.hidden);
  function syncVideo() {
    for (const video of videos) {
      if (stopHero()) {
        if (!video.paused) pausedByUs.add(video);
        if (!video.poster && video.dataset.poster) video.poster = video.dataset.poster;
        video.pause();
      } else if (pausedByUs.has(video) && !document.hidden && !reduced.matches && heroVisible() && video.getBoundingClientRect().width > 0) {
        pausedByUs.delete(video); video.play().catch(() => { /* Original poster remains if autoplay is blocked. */ });
      }
    }
  }
  // Existing homepage observers may request playback after a scroll/resize.
  // Enforce this explicit pause only while the campaign owns the invitation.
  videos.forEach(video => video.addEventListener("play", () => { if (stopHero()) { pausedByUs.add(video); video.pause(); } }));
  function sync() {
    clearTimeout(timer);
    const now = Date.now(), state = homepagePromotions(now);
    campaignActive = state.campaign?.id === "nye-mirrorball-2026";
    root.dataset.campaign = state.campaign?.id ?? "none";
    invitation.hidden = !ready || !campaignActive || dismissed || cramped.matches;
    if (!invitation.hidden && !started) {
      started = true;
      invitation.dataset.entrance = reduced.matches ? "settled" : "entering";
    }
    if (reduced.matches) invitation.dataset.entrance = "settled";
    invitation.dataset.paused = String(paused || document.hidden);
    pause.disabled = reduced.matches;
    pause.setAttribute("aria-pressed", String(paused));
    pause.setAttribute("aria-label", paused ? "Resume homepage motion" : "Pause homepage motion");
    pause.querySelector("span")!.textContent = paused ? "▶" : "Ⅱ";
    const generic = state.campaign ? [] : state.promos;
    const key = generic.map(p => p.id).join(",");
    if (genericKey !== key) { genericKey = key; activeIndex = 0; nextRotation = now + 7000; }
    if (now >= nextRotation && generic.length > 1 && !reduced.matches && !genericHover && !fallback.contains(document.activeElement) && !document.hidden && !genericDismissed) {
      activeIndex = (activeIndex + 1) % generic.length; nextRotation = now + 7000;
    }
    const availableIds = new Set(generic.map(p => p.id)), activeId = generic[activeIndex]?.id;
    for (const slide of slides) {
      slide.hidden = !availableIds.has(slide.dataset.promoKey!);
      const active = slide.dataset.promoKey === activeId;
      slide.toggleAttribute("data-active", active);
      if (active) { slide.removeAttribute("aria-hidden"); slide.removeAttribute("tabindex"); }
      else { slide.setAttribute("aria-hidden", "true"); slide.tabIndex = -1; }
    }
    fallback.hidden = !ready || !!state.campaign || genericDismissed || !generic.length;
    fallback.dataset.promoId = key;
    fallback.setAttribute("aria-label", generic.length > 1 ? "Promotions" : "Promotion");
    if (ready) document.body.classList.add("promo-ready");
    syncVideo();
    const boundary = state.nextChange === null ? 60_000 : Math.max(1, state.nextChange - now);
    const rotation = generic.length > 1 && !reduced.matches && !genericDismissed && !genericHover
      && !fallback.contains(document.activeElement) && !document.hidden ? Math.max(250, nextRotation - now) : 60_000;
    timer = setTimeout(sync, Math.min(60_000, boundary, rotation));
  }
  function headerSize() { if (chrome) root.style.setProperty("--homepage-header-height", `${chrome.getBoundingClientRect().height}px`); }
  invitation.addEventListener("animationend", event => { if (event.animationName === "homepage-mirrorball-drop") invitation.dataset.entrance = "settled"; });
  pause.addEventListener("click", () => { paused = !paused; sync(); });
  root.querySelector("[data-homepage-nye-dismiss]")!.addEventListener("click", () => {
    dismissed = true; paused = false; sync(); document.querySelector<HTMLAnchorElement>(".site-logo")?.focus({ preventScroll: true });
  });
  fallback.querySelector("[data-promo-dismiss]")!.addEventListener("click", () => { genericDismissed = true; sync(); document.querySelector<HTMLAnchorElement>(".site-logo")?.focus({ preventScroll: true }); });
  fallback.addEventListener("mouseenter", () => { genericHover = true; });
  fallback.addEventListener("mouseleave", () => { genericHover = false; nextRotation = Date.now() + 7000; sync(); });
  fallback.addEventListener("focusout", () => { nextRotation = Date.now() + 7000; });
  window.addEventListener("focus", sync); window.addEventListener("pageshow", sync);
  document.addEventListener("visibilitychange", () => { nextRotation = Date.now() + 7000; sync(); });
  reduced.addEventListener("change", sync);
  cramped.addEventListener("change", sync);
  window.addEventListener("resize", headerSize);
  if (chrome && "ResizeObserver" in window) new ResizeObserver(headerSize).observe(chrome);
  headerSize(); sync();
  if (!ready) setTimeout(() => { ready = true; sync(); }, 1200);
}
