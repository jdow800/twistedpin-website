export const prerender = false;

import type { APIRoute } from 'astro';
import { fetchLiveHoursFromAPI } from '../../../lib/google-hours';

// Daily rebuild trigger. Scheduled in vercel.json crons (4am Central).
// Vercel Cron auto-injects `Authorization: Bearer ${CRON_SECRET}` so a
// random caller can't trigger rebuilds.
//
// Two jobs:
//
//   1. Hours snapshot — fetch Google Places ONCE/day, commit the result
//      to src/data/live-hours.json via GitHub Contents API. Every build
//      that day reads from the committed JSON instead of hitting Places.
//      Drops Places API cost from ~$200/mo (~70 calls/build × ~10 builds/day)
//      to ~$0.62/mo (~30 calls/month). See decisions log 2026-05-13.
//
//      The GitHub commit auto-triggers a Vercel deploy (via the GitHub
//      integration that's already running), which is how the new menus
//      from GoTab/Untappd also get refreshed — single daily commit, single
//      daily deploy, both jobs covered.
//
//   2. Deploy hook fallback — if GITHUB_TOKEN isn't configured (e.g.
//      first deploy before the PAT is set up), fall back to the legacy
//      deploy-hook trigger so menus still refresh. The build will do a
//      live Places fetch in that case (memoized to 1 call per build).
//
// Required env vars:
//   CRON_SECRET             — any random string, set in Vercel + matched by cron
//   GITHUB_TOKEN            — fine-grained PAT with Contents:write on this repo
//   GITHUB_REPO             — "owner/repo" e.g. "jdow800/twistedpin-website"
//   VERCEL_DEPLOY_HOOK_URL  — fallback if GITHUB_TOKEN isn't set
//   GOOGLE_MAPS_API_KEY     — Places API key (already set for build-time use)
//   GOOGLE_PLACE_ID         — venue's place ID (already set for build-time use)

const HOURS_FILE_PATH = 'src/data/live-hours.json';

interface CronResult {
  ok: boolean;
  path: 'github-commit' | 'deploy-hook' | 'none';
  hoursFetched?: boolean;
  committed?: boolean;
  deployHookFired?: boolean;
  warnings?: string[];
}

export const GET: APIRoute = async ({ request }) => {
  const expected = `Bearer ${import.meta.env.CRON_SECRET}`;
  if (request.headers.get('authorization') !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result: CronResult = { ok: false, path: 'none', warnings: [] };
  const githubToken = import.meta.env.GITHUB_TOKEN;
  const githubRepo = import.meta.env.GITHUB_REPO;

  // Path 1: GitHub commit (preferred — decouples API call from build frequency).
  if (githubToken && githubRepo) {
    try {
      const hours = await fetchLiveHoursFromAPI();
      result.hoursFetched = hours !== null;

      if (hours) {
        const snapshot = JSON.stringify(
          { fetchedAt: new Date().toISOString(), hours },
          null,
          2,
        ) + '\n';

        const committed = await commitHoursToRepo({
          repo: githubRepo,
          token: githubToken,
          content: snapshot,
        });
        result.committed = committed;

        if (committed) {
          result.ok = true;
          result.path = 'github-commit';
          return jsonResponse(result);
        }
        result.warnings?.push('GitHub commit failed — falling back to deploy hook');
      } else {
        result.warnings?.push('Places API returned no hours — falling back to deploy hook');
      }
    } catch (e) {
      result.warnings?.push(`hours-commit path threw: ${(e as Error).message}`);
    }
  }

  // Path 2: Deploy hook fallback (legacy behavior).
  const hookUrl = import.meta.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    result.warnings?.push('VERCEL_DEPLOY_HOOK_URL not configured');
    return new Response(JSON.stringify(result), { status: 500, headers: jsonHeaders });
  }

  const res = await fetch(hookUrl, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text();
    console.error('[cron/rebuild] deploy hook failed:', res.status, body);
    result.warnings?.push(`deploy hook ${res.status}: ${body}`);
    return new Response(JSON.stringify(result), { status: 502, headers: jsonHeaders });
  }

  result.ok = true;
  result.path = 'deploy-hook';
  result.deployHookFired = true;
  return jsonResponse(result);
};

const jsonHeaders = { 'Content-Type': 'application/json' };
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: jsonHeaders });

/**
 * Commit (or no-op-skip if identical) the hours snapshot to the repo via
 * GitHub Contents API. Returns true on success (or skip), false on failure.
 *
 * Skip-on-identical: GitHub's PUT contents API requires the SHA of the
 * existing file; if the new content matches the old content byte-for-byte
 * we'd commit an empty diff. Skip in that case to avoid noise in git
 * history.
 */
async function commitHoursToRepo(opts: {
  repo: string;
  token: string;
  content: string;
}): Promise<boolean> {
  const { repo, token, content } = opts;
  const url = `https://api.github.com/repos/${repo}/contents/${HOURS_FILE_PATH}`;

  // GET current file to grab SHA. 404 means file doesn't exist yet (first run).
  const getRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  let sha: string | undefined;
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha: string; content: string };
    sha = existing.sha;
    // Skip the commit if content is identical (modulo fetchedAt timestamp,
    // which always changes — so this rarely skips, but keeps git clean if
    // both the timestamp + hours happen to round-trip identical).
    const existingContent = Buffer.from(existing.content, 'base64').toString('utf-8');
    if (existingContent === content) {
      return true;
    }
  } else if (getRes.status !== 404) {
    console.error('[cron/rebuild] GitHub GET failed:', getRes.status, await getRes.text());
    return false;
  }

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'cron: refresh live-hours snapshot from Google Places',
      content: Buffer.from(content, 'utf-8').toString('base64'),
      sha,
    }),
  });

  if (!putRes.ok) {
    console.error('[cron/rebuild] GitHub PUT failed:', putRes.status, await putRes.text());
    return false;
  }
  return true;
}
