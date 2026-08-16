export const prerender = false;

import type { APIRoute } from 'astro';
import {
  reviewConfigured,
  reviewPasswordMatches,
  issueReviewToken,
  reviewCookie,
} from '../../lib/avery-review-auth';

/**
 * /api/avery-review-auth — password gate for the Avery review dashboard.
 * Mirrors /api/playbook-admin-auth. Fails closed when
 * AVERY_REVIEW_ADMIN_PASSWORD is unset (public repo — no baked-in fallback).
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!reviewConfigured()) return redirect('/avery-review/?e=2', 303);

  let submitted: unknown = null;
  try {
    const ct = request.headers.get('content-type') ?? '';
    submitted = ct.includes('application/json')
      ? (await request.json())?.password
      : (await request.formData()).get('password');
  } catch {
    return redirect('/avery-review/?e=1', 303);
  }

  if (!reviewPasswordMatches(submitted)) {
    return redirect('/avery-review/?e=1', 303);
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/avery-review/',
      'Set-Cookie': reviewCookie(await issueReviewToken(), import.meta.env.DEV === true),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
