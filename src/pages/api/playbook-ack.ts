export const prerender = false;

import type { APIRoute } from 'astro';
import { PLAYBOOK_COOKIE, verifyToken } from '../../lib/playbook-auth';

/**
 * /api/playbook-ack — records that a teammate signed the Playbook.
 *
 * Two jobs, in this order:
 *   1. Write the acknowledgment row to Supabase (the record of truth).
 *   2. Email info@twistedpin.com so ops knows without checking a dashboard —
 *      "George Smith signed the Playbook 7/19 at 7:30 PM."
 *
 * The email is the ACTIVE signal and the table is the passive one. The point
 * of the email isn't the ones that arrive — it's noticing the one that doesn't,
 * which tells you a new hire never finished onboarding.
 *
 * ORDERING IS DELIBERATE: if the DB write fails we return not-ok so the
 * teammate retries and we don't lose the record. If only the EMAIL fails we
 * still return ok — the row exists, ops can query it, and making a teammate
 * re-sign because Resend had a bad minute would be the wrong trade. That does
 * mean a silent email failure is possible; the row is the backstop.
 *
 * NO NEW DEPENDENCIES. Supabase and Resend are both reached over plain REST
 * with fetch rather than pulling in @supabase/supabase-js + resend. This repo
 * keeps its dependency list short on purpose (page-speed targets are
 * non-negotiable per CLAUDE.md) and both APIs are a single POST.
 *
 * REQUIRED ENV (Vercel):
 *   SUPABASE_URL                — https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service role; server-only, NEVER PUBLIC_*
 *   RESEND_API_KEY              — same Resend account TPRS sends from
 * OPTIONAL:
 *   PLAYBOOK_NOTIFY_TO   (default info@twistedpin.com)
 *   PLAYBOOK_NOTIFY_FROM (default Twisted Pin <playbook@mail.twistedpin.com>)
 *
 * ⚠️ THE SENDING DOMAIN IS `mail.twistedpin.com`, NOT `twistedpin.com`.
 * Resend matches the sending domain EXACTLY, and only the `mail.` subdomain is
 * verified on the account. Sending from anything @twistedpin.com returns
 * 403 "domain is not verified" — which, because notification failure is
 * non-fatal here, shows up as a signature that saved fine and an email that
 * never arrived. Cost us two test rounds on 2026-07-20 to spot. The local part
 * (`playbook@`) is arbitrary and needs no real mailbox; only the domain matters.
 */

const TABLE = 'playbook_acknowledgments';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // The gate cookie is required. Not for identity — it can't prove that — but
  // so the endpoint isn't an open write target for anyone who finds the URL.
  const authed = await verifyToken(
    parseCookie(request.headers.get('cookie'))[PLAYBOOK_COOKIE],
  );
  if (!authed) return json({ ok: false, reason: 'unauthorized' }, 401);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  // Honeypot — a bot that fills the off-screen "website" field gets a success
  // response and no row. Silent so it can't probe for the real validation.
  if (typeof input.website === 'string' && input.website.trim() !== '') {
    return json({ ok: true }, 200);
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 120) {
    return json({ ok: false, reason: 'invalid_name' }, 400);
  }
  if (input.agree !== true) {
    return json({ ok: false, reason: 'not_agreed' }, 400);
  }

  const ip =
    clientAddress ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;
  const userAgent = request.headers.get('user-agent') ?? null;
  const signedAt = new Date();

  const supabaseUrl = import.meta.env.SUPABASE_URL;
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Misconfiguration, not user error. Fail loudly rather than pretending to
    // record a signature we're dropping on the floor.
    console.error('[playbook-ack] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ ok: false, reason: 'not_configured' }, 500);
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        full_name: name,
        signed_at: signedAt.toISOString(),
        ip_address: ip,
        user_agent: userAgent,
        page_url: typeof input.page_url === 'string' ? input.page_url : null,
      }),
    });

    if (!res.ok) {
      console.error('[playbook-ack] supabase insert failed', res.status, await res.text());
      return json({ ok: false, reason: 'store_failed' }, 200);
    }
  } catch (err) {
    console.error('[playbook-ack] supabase unreachable', err);
    return json({ ok: false, reason: 'store_failed' }, 200);
  }

  // Best-effort notification. Never fails the request — see docstring.
  await notify(name, signedAt).catch((err) =>
    console.error('[playbook-ack] notify failed', err),
  );

  return json({ ok: true }, 200);
};

/** "7/19 at 7:30 PM" in Central — the venue's timezone, and the way ops
 *  actually reads a date. Never UTC in a human-facing string. */
function centralStamp(d: Date): string {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric',
    day: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${date} at ${time}`;
}

async function notify(name: string, signedAt: Date): Promise<void> {
  const key = import.meta.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[playbook-ack] RESEND_API_KEY not set — skipping notification');
    return;
  }

  const to = import.meta.env.PLAYBOOK_NOTIFY_TO || 'info@twistedpin.com';
  // Must be @mail.twistedpin.com — the apex is NOT verified on Resend.
  const from =
    import.meta.env.PLAYBOOK_NOTIFY_FROM ||
    'Twisted Pin <playbook@mail.twistedpin.com>';
  const stamp = centralStamp(signedAt);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${name} signed the Playbook`,
      // Subject line carries the whole message so it's readable from a phone
      // lock screen without opening anything.
      text: `${name} signed the Twisted Pin Playbook on ${stamp} (Central).\n\nThis is an automatic notification. If a new teammate hasn't triggered one of these, they haven't finished the Playbook yet.`,
    }),
  });

  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${await res.text()}`);
  }
}

function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
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
