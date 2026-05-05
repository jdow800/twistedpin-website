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
    inlineStylesheets: 'auto',
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
