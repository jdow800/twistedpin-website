// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  // Sitemap + canonical URL base. Currently pointed at the Vercel
  // staging deploy. **At launch:** swap to `https://www.twistedpin.com`
  // (or `https://twistedpin.com` — pick one canonical host) and
  // resubmit sitemap.xml to Google Search Console.
  site: 'https://twistedpin-website.vercel.app',
  output: 'static',
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
