export const prerender = false;

import type { APIRoute } from 'astro';
import { clearWhoCookie } from '../../lib/playbook-auth';

/**
 * /api/playbook-who-reset — "Not you?" on a shared device.
 *
 * WHY THIS EXISTS: the identity cookie lasts 30 days. On the front-desk
 * computer that means teammate B lands in teammate A's session — greeted by
 * the wrong name and, far worse, handed a signature form PRE-FILLED with
 * someone else's name. Of everything in this system, that's the only path that
 * could attach the wrong person to an acknowledgment.
 *
 * Clears the identity ONLY. The team session survives: the next teammate is
 * still authorized (shared password, staff-area machine), and making them
 * retype it would add friction with no security benefit — friction being
 * exactly what would make someone skip the reset and sign as whoever was here
 * before.
 *
 * A form POST rather than fetch, so it works before any JS runs and needs no
 * client state. The reading counters are keyed by session id, so a fresh
 * identity gets fresh counters automatically — nothing to clean up here.
 *
 * Deliberately NOT deleting the previous playbook_sessions row: someone who
 * started and walked away should stay visible on the status page as
 * "started, never finished". That's the signal, not noise.
 */
export const POST: APIRoute = async ({ redirect }) => {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/playbook/',
      'Set-Cookie': clearWhoCookie(import.meta.env.DEV === true),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
