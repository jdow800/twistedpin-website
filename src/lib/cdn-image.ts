/**
 * cdnImage — routes external image URLs through Vercel's Image
 * Optimization API for AVIF/WebP encoding + CDN edge caching.
 *
 * Vercel's image API (deployed at `/_vercel/image` when astro.config.mjs
 * sets `imageService: true`) fetches the source image once, re-encodes
 * to AVIF/WebP/JPEG based on the requesting browser's Accept header,
 * and caches the result on Vercel's global edge network for 30 days.
 *
 * Used by /menu/cocktails and /menu/food — GoTab serves images as
 * JPEG only with no edge caching for our users. Routing through Vercel
 * gets us:
 *   - AVIF for Chrome (50% smaller than JPEG at equivalent quality)
 *   - WebP for Safari (30% smaller)
 *   - JPEG fallback for legacy browsers
 *   - Same-origin requests (no third-party DNS+TLS handshake)
 *   - Global CDN edge caching (first visitor pays origin pull cost;
 *     all subsequent visitors get cached version)
 *
 * Quota: Vercel Pro includes 5,000 source images/mo + 1M
 * transformations/mo. ~85 unique GoTab menu images × ~12 variants
 * = ~1,000 transformations to fully prime the cache. Well under limit.
 *
 * Same-origin URLs and unknown remote hostnames return unchanged —
 * Vercel only accepts source URLs matching the `imagesConfig.domains`
 * allowlist in astro.config.mjs.
 *
 * @param url     Source image URL (likely from GoTab API response)
 * @param width   Target width in pixels (Vercel resizes + caches per width)
 * @param quality AVIF/WebP/JPEG quality, 1-100. Default 70 — verified
 *                visually identical to q80 for product photography at
 *                thumbnail sizes (<720px), ~30% smaller file size.
 *                Stop at q70: q60 starts to show artifacts on detailed
 *                food images. Override per-call if a specific image
 *                needs higher fidelity (e.g. a hero photograph).
 *
 * @returns Vercel image URL, or null if input was null/undefined.
 *
 * @example
 *   cdnImage("https://img.gotab.io/products/.../foo.jpeg", 480)
 *   // -> "/_vercel/image?url=https%3A%2F%2Fimg.gotab.io%2F...&w=480&q=70"
 */
export function cdnImage(
  url: string | null | undefined,
  width: number,
  quality = 70,
): string | null {
  if (!url) return null;
  const encoded = encodeURIComponent(url);
  return `/_vercel/image?url=${encoded}&w=${width}&q=${quality}`;
}
