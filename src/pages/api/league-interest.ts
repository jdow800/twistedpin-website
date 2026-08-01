export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * /api/league-interest — league interest form on /leagues (added 2026-08-01
 * per Jon: name, email, and structured fields that actually yield routing
 * info — single bowler vs team, preferred night — plus a free-text box).
 *
 * Delivery is EMAIL, not the loyalty rail: league interest is a lead for a
 * human conversation (league coordinator / front desk), not a marketing-list
 * join, and /leagues already routed inquiries to contactus@ (Freshdesk
 * triage). The Resend send mirrors /api/playbook-ack — the from address MUST
 * be @mail.twistedpin.com (the apex is NOT verified on Resend; anything
 * @twistedpin.com returns 403). reply_to is the submitter, so the coordinator
 * just hits Reply.
 *
 * REQUIRED ENV (Vercel): RESEND_API_KEY (already set for /playbook)
 * OPTIONAL:
 *   LEAGUE_NOTIFY_TO   (default contactus@twistedpin.com)
 *   LEAGUE_NOTIFY_FROM (default Twisted Pin Website <leagues@mail.twistedpin.com>)
 *
 * Failure is LOUD to the user (unlike playbook's non-fatal notify): if the
 * email can't send, the lead would be silently lost, so the form shows the
 * error + the mailto fallback instead of a false success.
 */

export const POST: APIRoute = async ({ request }) => {
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  // Honeypot: pretend success, send nothing.
  if (typeof input.website_url === 'string' && input.website_url.trim() !== '') {
    return json({ ok: true }, 200);
  }

  const name = str(input.name);
  const email = str(input.email);
  const signupAs = str(input.signup_as) || 'Not specified';
  const night = str(input.night) || 'Not specified';
  const message = str(input.message);

  if (!name) return json({ ok: false, reason: 'missing_name' }, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ ok: false, reason: 'invalid_email' }, 200);

  const key = import.meta.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[league-interest] RESEND_API_KEY not set — lead NOT delivered');
    return json({ ok: false, reason: 'upstream_error' }, 200);
  }

  const to = import.meta.env.LEAGUE_NOTIFY_TO || 'contactus@twistedpin.com';
  // Must be @mail.twistedpin.com — the apex is NOT verified on Resend.
  const from =
    import.meta.env.LEAGUE_NOTIFY_FROM ||
    'Twisted Pin Website <leagues@mail.twistedpin.com>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: [email],
        // Subject carries the routing info so it reads from a phone lock screen.
        subject: `League interest — ${name} (${signupAs} · ${night})`,
        text:
          `New league interest from the website (/leagues):\n\n` +
          `Name:            ${name}\n` +
          `Email:           ${email}\n` +
          `Signing up as:   ${signupAs}\n` +
          `Preferred night: ${night}\n` +
          (message ? `\nMessage:\n${message}\n` : `\n(No message left.)\n`) +
          `\nReply to this email to respond directly to ${name}.`,
      }),
    });

    if (!res.ok) {
      console.warn(`[league-interest] resend ${res.status}: ${await res.text()}`);
      return json({ ok: false, reason: 'upstream_error' }, 200);
    }
    return json({ ok: true }, 200);
  } catch {
    return json({ ok: false, reason: 'network_error' }, 200);
  }
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
