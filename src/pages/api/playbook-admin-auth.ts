export const prerender = false;

import type { APIRoute } from 'astro';
import {
  adminCookie,
  adminConfigured,
  adminPasswordMatches,
  issueAdminToken,
} from '../../lib/playbook-auth';

/**
 * /api/playbook-admin-auth — gate for the manager status page.
 *
 * Separate from the team password because the status page lists every
 * teammate's name, completion state, and reading time. The team password is
 * known by the whole team; guarding this with it would publish everyone's
 * reading habits to everyone.
 *
 * Fails closed when PLAYBOOK_ADMIN_PASSWORD is unset — this repo is public, so
 * a baked-in fallback would be a published password.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!adminConfigured()) return redirect('/playbook/status/?e=2', 303);

  let submitted: unknown = null;
  try {
    const ct = request.headers.get('content-type') ?? '';
    submitted = ct.includes('application/json')
      ? (await request.json())?.password
      : (await request.formData()).get('password');
  } catch {
    return redirect('/playbook/status/?e=1', 303);
  }

  if (!adminPasswordMatches(submitted)) {
    return redirect('/playbook/status/?e=1', 303);
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/playbook/status/',
      'Set-Cookie': adminCookie(await issueAdminToken(), import.meta.env.DEV === true),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
