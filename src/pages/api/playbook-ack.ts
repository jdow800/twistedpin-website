export const prerender = false;

import type { APIRoute } from 'astro';
import {
  PLAYBOOK_COOKIE,
  PLAYBOOK_WHO_COOKIE,
  verifyToken,
  verifyWhoToken,
} from '../../lib/playbook-auth';
import { insert, storeConfig, updateWhere } from '../../lib/playbook-store';

/**
 * /api/playbook-ack — records that a teammate signed the Playbook.
 *
 * Three jobs, in this order:
 *   1. Write the acknowledgment row (the record of truth).
 *   2. Complete the reading session with how long they actually read.
 *   3. Email info@twistedpin.com.
 *
 * The email is the ACTIVE signal and the tables are the passive ones. The point
 * of the email isn't the ones that arrive — it's noticing the one that doesn't,
 * which tells you a new hire never finished onboarding.
 *
 * ORDERING IS DELIBERATE: if the acknowledgment write fails we return not-ok so
 * the teammate retries and we don't lose the record. If only the session update
 * or the EMAIL fails we still return ok — the signature exists, and making
 * someone re-sign because Resend had a bad minute would be the wrong trade.
 *
 * ⚠️ SENDING DOMAIN IS `mail.twistedpin.com`, NOT the apex. Resend matches the
 * domain exactly and only the `mail.` subdomain is verified. Sending from
 * anything @twistedpin.com returns 403 — which, because notification failure is
 * non-fatal here, looks like a signature that saved fine and an email that
 * never arrived. Cost two test rounds on 2026-07-20 to spot.
 *
 * REQUIRED ENV (Vercel):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
 * OPTIONAL:
 *   PLAYBOOK_NOTIFY_TO   (default info@twistedpin.com)
 *   PLAYBOOK_NOTIFY_FROM (default Twisted Pin <playbook@mail.twistedpin.com>)
 */

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const cookies = parseCookie(request.headers.get('cookie'));

  // The gate cookie is required. Not for identity — a shared password can't
  // prove that — but so this isn't an open write target for anyone with the URL.
  if (!(await verifyToken(cookies[PLAYBOOK_COOKIE]))) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }
  const who = await verifyWhoToken(cookies[PLAYBOOK_WHO_COOKIE]);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  // Honeypot — a bot filling the off-screen field gets success and no row.
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

  // Client-reported reading metrics. Clamped, never trusted: they come from the
  // browser and are trivially forgeable. They're a coaching signal ("worth a
  // real read"), NOT evidence — treat them accordingly.
  const activeSeconds = clampInt(input.active_seconds, 0, 60 * 60 * 24);
  const pagesViewed = clampInt(input.pages_viewed, 0, 500);
  const totalPages = clampInt(input.total_pages, 0, 500);

  const ip =
    clientAddress ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;
  const userAgent = request.headers.get('user-agent') ?? null;
  const signedAt = new Date();

  const cfg = storeConfig();
  if (!cfg) {
    console.error('[playbook-ack] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ ok: false, reason: 'not_configured' }, 500);
  }

  const stored = await insert(cfg, 'playbook_acknowledgments', {
    full_name: name,
    signed_at: signedAt.toISOString(),
    ip_address: ip,
    user_agent: userAgent,
    page_url: typeof input.page_url === 'string' ? input.page_url : null,
    session_id: who?.sid ?? null,
  });
  if (!stored) return json({ ok: false, reason: 'store_failed' }, 200);

  // Best-effort from here down. Neither of these failing should cost the
  // teammate their signature.
  if (who?.sid) {
    await updateWhere(cfg, 'playbook_sessions', 'id', who.sid, {
      completed_at: signedAt.toISOString(),
      active_seconds: activeSeconds,
      pages_viewed: pagesViewed,
      total_pages: totalPages,
    }).catch((err) => console.error('[playbook-ack] session update failed', err));
  }

  await notify(name, signedAt, activeSeconds, pagesViewed, totalPages).catch((err) =>
    console.error('[playbook-ack] notify failed', err),
  );

  return json({ ok: true }, 200);
};

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? Math.round(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** "7/19 at 7:30 PM" in Central — the venue's timezone, and how ops reads a
 *  date. Never UTC in a human-facing string. */
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

/**
 * Human summary of the reading metrics — or an honest refusal to give one.
 *
 * ⚠️ THIS FUNCTION EXISTS TO AVOID ACCUSING SOMEONE. On day one it reported
 * "17 seconds of reading, 2 of 19 pages" for a reader who had genuinely gone
 * through the whole book over ~20 minutes: her counters were in-memory and got
 * wiped by two deploys and an iOS tab eviction. The storage bug is fixed, but
 * the metric is inherently lossy — private browsing, cleared storage, reading
 * on two devices — and it will undercount again.
 *
 * So the rule: a LOW number is never reported as fact. If someone reached the
 * end but the data says they barely looked, the data is far more likely to be
 * wrong than the person, and we say the data is missing. Overstating diligence
 * costs nothing; understating it accuses a teammate of skimming their handbook.
 */
function readingSummary(
  activeSeconds: number | null,
  pagesViewed: number | null,
  totalPages: number | null,
): string {
  if (activeSeconds === null || pagesViewed === null) return '';

  // Implausible-but-signed = almost certainly lost telemetry, not a skimmer.
  // Anyone who actually clicked through to the signature saw the pages; the
  // signature page is only reachable by advancing through the book.
  const tooFewPages = !!totalPages && pagesViewed < Math.min(4, totalPages);
  const tooFast = activeSeconds < 60;
  if (tooFewPages || tooFast) return ' — reading time not captured';

  const mins = Math.round(activeSeconds / 60);
  const time = `${mins} minute${mins === 1 ? '' : 's'}`;
  const pages = totalPages ? `, ${pagesViewed} of ${totalPages} pages` : '';
  return ` — ${time} of reading${pages}`;
}

async function notify(
  name: string,
  signedAt: Date,
  activeSeconds: number | null,
  pagesViewed: number | null,
  totalPages: number | null,
): Promise<void> {
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
  const summary = readingSummary(activeSeconds, pagesViewed, totalPages);

  // The subject carries the whole message so it reads from a phone lock screen
  // without opening anything.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${name} signed the Playbook${summary}`,
      text:
        `${name} signed the Twisted Pin Playbook on ${stamp} (Central)${summary}.\n\n` +
        `Reading time counts only while the page was actually open in front of them, so it ` +
        `survives someone reading across two shifts. It is lossy by nature — reading on two ` +
        `devices, private browsing, or clearing site data all lose it — so it is a coaching ` +
        `signal, never evidence. When the numbers look implausible we say "not captured" ` +
        `rather than report a low figure, because a teammate who reached the signature page ` +
        `got there by advancing through the book.\n\n` +
        `This is an automatic notification. If a new teammate hasn't triggered one of these, ` +
        `they haven't finished the Playbook yet.`,
    }),
  });

  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
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
