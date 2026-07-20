export const prerender = false;

import type { APIRoute } from 'astro';
import {
  PLAYBOOK_COOKIE,
  issueWhoToken,
  normalizeName,
  verifyToken,
  whoCookie,
} from '../../lib/playbook-auth';
import { insertReturning, storeConfig } from '../../lib/playbook-store';

/**
 * /api/playbook-who — "Who are we talking to?"
 *
 * Runs after the password, before the hub. Creates the reading session row and
 * hands back a signed cookie carrying the name + session id.
 *
 * WHY RECORD THE START AT ALL — and why this does NOT send an email.
 * The thing Jon needs to know is when a new hire *hasn't* finished, and no
 * notification can tell you about an event that never happened. Emailing every
 * login would also train info@ to ignore Playbook mail, which would blunt the
 * completion alert that actually matters. So: record silently here, alert only
 * on completion, and let "started but never signed" be a question the data can
 * answer — `select … from playbook_sessions where completed_at is null`.
 *
 * A teammate who reads across several shifts creates ONE session (the cookie
 * lives 30 days), so the incomplete list doesn't fill with duplicates of the
 * same person mid-read.
 */
export const POST: APIRoute = async ({ request, clientAddress, redirect }) => {
  // Must already be past the password gate.
  const authed = await verifyToken(
    parseCookie(request.headers.get('cookie'))[PLAYBOOK_COOKIE],
  );
  if (!authed) return redirect('/playbook/', 303);

  let submitted: unknown = null;
  try {
    const ct = request.headers.get('content-type') ?? '';
    submitted = ct.includes('application/json')
      ? (await request.json())?.name
      : (await request.formData()).get('name');
  } catch {
    return redirect('/playbook/?n=1', 303);
  }

  const name = normalizeName(submitted);
  if (!name) return redirect('/playbook/?n=1', 303);

  const cfg = storeConfig();
  if (!cfg) {
    console.error('[playbook-who] Supabase not configured');
    return redirect('/playbook/?n=2', 303);
  }

  const row = await insertReturning<{ id: string }>(cfg, 'playbook_sessions', {
    full_name: name,
    ip_address:
      clientAddress ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      null,
    user_agent: request.headers.get('user-agent') ?? null,
  });

  if (!row?.id) return redirect('/playbook/?n=2', 303);

  const isDev = import.meta.env.DEV === true;
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/playbook/',
      'Set-Cookie': whoCookie(await issueWhoToken({ name, sid: row.id }), isDev),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};

function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}
