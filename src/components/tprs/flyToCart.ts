// Fly-to-cart micro-interaction (the common e-commerce "item arcs into the
// cart" cue). Given the DOM element that was clicked, spawns a transient Glow
// dot that arcs from that element to the cart icon (`.tprs-summary-cart`, which
// exists in both the mobile bottom bar and the desktop rail) and fades out.
// The cart icon's own bump (StickySummary) fires separately on count increase,
// so the two read as one "added!" beat. Respects prefers-reduced-motion.

export function flyToCart(source: HTMLElement | null): void {
  if (!source) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const target = document.querySelector<HTMLElement>(".tprs-summary-cart");
  if (!target) return;

  const s = source.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const sx = s.left + s.width / 2;
  const sy = s.top + s.height / 2;
  const tx = t.left + t.width / 2;
  const ty = t.top + t.height / 2;

  const dot = document.createElement("div");
  dot.className = "tprs-fly";
  dot.style.left = `${sx}px`;
  dot.style.top = `${sy}px`;
  document.body.appendChild(dot);

  const dx = tx - sx;
  const dy = ty - sy;
  // Arc: lift up at the midpoint, then drop toward the cart while shrinking.
  const arcLift = Math.min(120, Math.abs(dy) * 0.4 + 50);

  const anim = dot.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arcLift}px) scale(0.9)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.2 },
    ],
    { duration: 620, easing: "cubic-bezier(0.5, 0, 0.75, 0)" },
  );
  anim.onfinish = () => dot.remove();
  anim.oncancel = () => dot.remove();
}
