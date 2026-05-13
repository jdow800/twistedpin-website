// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
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
    imageService: false,
  }),
  integrations: [sitemap()],
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
  },
});
