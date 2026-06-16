// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  // Sitemap + canonical URL base. Set to www.twistedpin.com pre-DNS-flip
  // so the deployed sitemap + canonical tags are correct from the moment
  // DNS points at Vercel. While DNS still points at Cloudflare, the
  // staging URL (twistedpin-website.vercel.app) renders pages whose
  // canonical tags reference www.twistedpin.com — harmless because
  // browsers don't navigate on canonical and Google doesn't crawl the
  // staging URL (no inbound links, not in sitemap). Resubmit sitemap.xml
  // to GSC after DNS flip.
  site: 'https://www.twistedpin.com',
  output: 'static',
  // Force trailing slash on every URL Astro generates (sitemap, links,
  // canonical). Was 'ignore' (default) — both /bar and /bar/ resolved,
  // and the per-request canonical tag canonicalized each variant to
  // itself. The round-2 audit (2026-05-08) flagged 18 duplicate-content
  // pairs + 9 sitemap-mismatch entries because of it. Now: every URL
  // is the trailing-slash form, vercel.json mirrors with `trailingSlash:
  // true` for runtime 308 redirects, and Google has one canonical per
  // page to index.
  trailingSlash: 'always',
  adapter: vercel({
    webAnalytics: { enabled: false },
    // Enable Vercel's image optimization edge function (deployed at
    // /_vercel/image). Required to route remote GoTab menu images through
    // Vercel's AVIF/WebP encoder + edge CDN caching — see src/lib/cdn-image.ts.
    // Local static images (e.g. /public/snap/*) are pre-encoded by
    // scripts/build-snap-images.mjs and served as static files; this setting
    // doesn't affect them.
    imageService: true,
    imagesConfig: {
      // Widths the optimizer will produce. Matches our srcset breakpoints:
      // mobile 2-col / tablet 3-col cards request 480w; desktop 4-col cards
      // request 720w (270px CSS × ~2.7x effective DPR).
      sizes: [320, 480, 720, 1080],
      // Remote hostnames allowed as source URLs. GoTab serves cocktail +
      // food product images. Untappd's beer label thumbnails are tiny and
      // already fast — not routed here.
      domains: ['img.gotab.io'],
      // AVIF first (50% smaller than JPEG, ~95% browser support), WebP
      // fallback (30% smaller, ~99% browser support). Vercel auto-negotiates
      // via Accept header; legacy browsers fall through to JPEG.
      formats: ['image/avif', 'image/webp'],
    },
  }),
  integrations: [
    sitemap({
      // Exclude the internal TPRS booking-flow preview (ADR-0029 §2). The
      // /tprs/* route is noindex,nofollow + unlinked; it must also stay out
      // of the sitemap so it's never surfaced to crawlers. Defense-in-depth
      // alongside the per-page robots meta + the public/robots.txt Disallow.
      //
      // Also exclude texted-offer landing pages (/1hr, /bday, /hrcard, and
      // future SMS-only offer URLs) + the parked previews (/coupon-preview,
      // /reserve-preview). These are noindex campaign / preview links —
      // keeping them out of the sitemap prevents GSC "submitted URL marked
      // noindex" warnings. Add new offer/preview slugs to the list.
      filter: (page) =>
        !page.includes('/tprs') &&
        !page.includes('/coupon-preview') &&
        // Parked at its REAL slug (kids birthday bookings) — remove this line
        // at birthday-booking launch so the page enters the sitemap.
        !page.includes('/reserve/birthdays') &&
        // Parked at its REAL slug (NYE party-slot bookings) — remove this line
        // at NYE-booking launch so the page enters the sitemap.
        !page.includes('/reserve/nye') &&
        !['/1hr', '/bday', '/hrcard'].some((slug) => page.includes(slug)),
    }),
    // React islands for the TPRS customer booking flow (ADR-0029 §1 — the
    // booking experience lives in this Astro repo as framework islands, not a
    // standalone SPA). The marketing site stays static; only /tprs hydrates a
    // client:only React wizard. Stripe's first-party React SDK is the reason
    // React (not another framework) is the island runtime per ADR-0029.
    react(),
  ],
  build: {
    // Inline ALL stylesheets into the HTML head (was 'auto', which only
    // inlined files <4KB). Both render-blocking sheets on the homepage
    // (SnapFooter.css ~30KB, index.css ~8KB) sat above that ceiling and
    // cost two extra round-trips on first paint.
    //
    // Trade-off: ~6-8KB gzipped grows the per-page HTML payload (HTML
    // can't share CSS across page navigations like the cached external
    // file would). For a content site where most visitors land on one
    // page from search and decide there, eliminating the round-trips on
    // that landing-page paint is the bigger win — repeat-visit cache
    // savings are theoretical when ~90% of traffic is mobile-first-time.
    //
    // Per-page CSS still chunks per-route via Astro's per-page bundling;
    // 'always' just inlines the chunks the page already needs into its
    // own HTML rather than emitting them as separate _astro/*.css files.
    inlineStylesheets: 'always',
  },
  vite: {
    server: {
      // Dev proxy for the TPRS customer-flow API (ADR-0029 §3 cross-origin
      // story, dev variant). The Astro dev origin (localhost:4321) and the
      // TPRS backend (localhost:3000) are different origins; rather than
      // wrangle CORS + the Secure/Domain-pinned cart cookie on localhost
      // http, the booking islands fetch a same-origin `/tprs-api/*` path
      // that Vite proxies to the backend. Dev-only — a deployed preview
      // points the client at PUBLIC_TPRS_API_BASE (a real API host) instead.
      // Start the backend with `pnpm dev` in dev/tprs/apps/backend first.
      //
      // The `rewrite` does two things: (1) strip the `/tprs-api` prefix so
      // `/tprs-api/api/products/bookable` → `/api/products/bookable`; (2) strip
      // the trailing slash the client adds before the query string. That slash
      // is load-bearing: this site runs `trailingSlash: 'always'`, so Astro
      // 404s a non-slash path BEFORE the Vite proxy can forward it — the client
      // (src/tprs/client.ts) appends `/` for dev-proxy requests, and we remove
      // it here because the backend's Fastify routes are no-trailing-slash.
      proxy: {
        '/tprs-api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (p) =>
            p.replace(/^\/tprs-api/, '').replace(/\/(\?|$)/, '$1'),
          // Belt-and-suspenders cookie fix for the dev proxy. The backend now
          // serializes the cart-token cookie env-aware (drops Domain + Secure in
          // dev), so this is REDUNDANT against current main — but it also makes
          // the booking flow work against an older backend that still pins the
          // prod attrs (`Domain=.book.twistedpin.com; Secure`), which a browser
          // on http://localhost would reject (so the hold never sticks and
          // payment-intents 400s). Strips Domain + Secure from Set-Cookie in DEV
          // ONLY (this proxy is dev-only); HttpOnly + SameSite=Lax stay, and the
          // SPA reads cartToken from the response body, never the cookie. Safe to
          // delete once everyone's on the env-aware backend.
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const sc = proxyRes.headers['set-cookie'];
              if (sc) {
                proxyRes.headers['set-cookie'] = sc.map((c) =>
                  c.replace(/;\s*Domain=[^;]+/i, '').replace(/;\s*Secure/i, ''),
                );
              }
            });
          },
        },
      },
      fs: {
        // Worktrees live at <repo>/.claude/worktrees/<name>/, but node_modules
        // (motion, @fontsource/*, ...) is hoisted to the repo root. Vite's
        // default fs.allow stops at the worktree root, so dev requests for
        // hoisted deps return "outside Vite serving allow list" 403s, Motion
        // One never loads, and the hero + CTA-bar entry animations never fire
        // (opacity stays at 0). Allowing the great-grandparent unblocks every
        // worktree without affecting the production build.
        allow: [path.resolve(__dirname, '../../..')],
      },
    },
    build: {
      // Target modern browsers — drops polyfills for nullish-coalescing,
      // optional chaining, async/await, object-spread, etc. (~12-14 KiB
      // saved per page per PSI's "Legacy JavaScript" audit). ES2020 has
      // 97%+ browser support globally and 99%+ on mobile (our 90% traffic
      // share). The browsers that fall off (Safari <14, iOS <14, Chrome
      // <90, Firefox <80, all 2020 or earlier) are vanishingly rare —
      // and they degrade to "feature missing" not "page broken" since
      // we don't rely on optional chaining for critical paths.
      //
      // Vite ships a single build (not differential serving) so this is
      // the trade-off: faster mainstream load vs zero legacy support.
      target: 'es2020',
    },
  },
});
