export const prerender = false;

import type { APIRoute } from 'astro';
import {
  issueToken,
  passwordMatches,
  sessionCookie,
} from '../../lib/playbook-auth';

/**
 * /api/playbook-auth — the Playbook password gate.
 *
 * Accepts the gate form POST (application/x-www-form-urlencoded), and on a
 * match sets the signed session cookie and redirects back to /playbook/.
 *
 * WHY A FORM POST + REDIRECT, NOT FETCH
 * The gate has to work before any JS runs. A plain <form method="POST"> means
 * the page is usable with JS disabled or still loading, and the browser's own
 * password manager gets a real form submission to offer to save. The cost is
 * a full page load, which is fine — this happens once per 30 days.
 *
 * Failure redirects to /playbook/?e=1 rather than rendering an error here, so
 * the wrong-password state is a normal GET of the gate page (refreshable, no
 * "resubmit form?" dialog).
 *
 * DELIBERATELY NOT RATE-LIMITED IN CODE. The password protects an employee
 * culture book, not customer or payment data, and Vercel's platform limits
 * already cap brute-force throughput. Adding a KV-backed limiter would be more
 * moving parts than the threat justifies. If this ever guards something real,
 * that changes.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  let submitted: unknown = null;

  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      submitted = (await request.json())?.password;
    } else {
      submitted = (await request.formData()).get('password');
    }
  } catch {
    return redirect('/playbook/?e=1', 303);
  }

  if (!passwordMatches(submitted)) {
    return redirect('/playbook/?e=1', 303);
  }

  const token = await issueToken();
  const isDev = import.meta.env.DEV === true;

  // 303 (not 302) so the browser converts POST → GET on the redirect. Without
  // it, a refresh on the landed page re-POSTs the password.
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/playbook/',
      'Set-Cookie': sessionCookie(token, isDev),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
