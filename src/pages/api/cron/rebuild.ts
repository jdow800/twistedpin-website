export const prerender = false;

import type { APIRoute } from 'astro';

// Daily rebuild trigger. Scheduled in vercel.json crons (4am Central).
// Vercel Cron auto-injects `Authorization: Bearer ${CRON_SECRET}` so a
// random caller can't trigger rebuilds. The route fires the project's
// deploy hook URL, which queues a fresh production build — fresh build
// re-fetches the GoTab menu and bakes it into static HTML.
//
// Required env vars:
//   CRON_SECRET             — any random string, set in Vercel + matched by cron
//   VERCEL_DEPLOY_HOOK_URL  — created in Vercel dashboard → Settings → Git → Deploy Hooks

export const GET: APIRoute = async ({ request }) => {
  const expected = `Bearer ${import.meta.env.CRON_SECRET}`;
  if (request.headers.get('authorization') !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const hookUrl = import.meta.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    return new Response('VERCEL_DEPLOY_HOOK_URL not configured', { status: 500 });
  }

  const res = await fetch(hookUrl, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text();
    console.error('[cron/rebuild] deploy hook failed:', res.status, body);
    return new Response(`Deploy hook failed: ${res.status}`, { status: 502 });
  }

  return new Response(
    JSON.stringify({ ok: true, triggeredAt: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
