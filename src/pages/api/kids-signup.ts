export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * /api/kids-signup — server-side intake proxy for the Free Kids Bowling signup
 * (the native form on /free-kids-bowling; promoted from /kids-signup-preview
 * at the 2026-07-24 loyalty cutover).
 *
 * Mirrors /api/coupon-signup (same n8n intake webhook, same consent-evidence
 * relay), with TWO differences specific to the kids program:
 *
 *   1. offer_slug = null. The kids offer is NOT granted at signup. It's a
 *      WINDOWED program: the daily cron (public.run_windowed_programs) mints a
 *      fresh, redeemable grant every weekday at 10:45a that expires at 4:10p.
 *      Signup only ENROLLS the member into the daily-grant pool.
 *
 *   2. program_tag = 'program:kids-free-bowl'. Enrollment === having this tag,
 *      because the windowed automation's segment matches on it. Applying the
 *      tag is the whole job of signup.
 *
 * ⚠️ BACKEND DEPENDENCY (not yet wired): the n8n intake (WF-Loyalty-Forms-Intake)
 * must handle form_slug='kids-free-bowl' by (a) calling intake_form_submission
 * with p_offer_slug=NULL, (b) APPLYING the program tag — the RPC does NOT tag
 * (db/018), so n8n inserts the customer_tag itself — and (c) sending the kids
 * welcome text ("you're in — see the front desk", no offer link). It must also
 * match the windowed automation's segment tag. Until that handler exists,
 * a submission upserts the customer but won't tag or send the right text.
 * LIVE as of 2026-07-24 — the page is public and indexable.
 *
 * Override the endpoint in non-prod via LOYALTY_INTAKE_URL if ever needed.
 *
 * ---- 2027 WAITLIST MODE (pre-staged 2026-08-01) --------------------------
 * The 2026 program ends EOD Aug 14. This endpoint is serverless (prerender
 * false), so the date gate below evaluates at REQUEST time: from midnight CT
 * Aug 15 every submission is a 2027-WAITLIST join — form_slug
 * 'kids-free-bowl-waitlist-2027', tag 'program:kids-free-bowl-2027-waitlist',
 * still no offer_slug. The waitlist tag is marketing + early-access only
 * (per Jon 2026-08-01: NO rollover — 2027 enrollment is a separate tag the
 * 2027 grant cron will match on; everyone re-registers).
 * ⚠️ n8n WF-Loyalty-Forms-Intake needs the waitlist form_slug branch
 * (upsert + tag from payload + waitlist welcome text, NO grant) BEFORE
 * Aug 15. The page (/free-kids-bowling) flips itself the same midnight via
 * the daily cron rebuild.
 */
const INTAKE_URL =
  import.meta.env.LOYALTY_INTAKE_URL ??
  'https://n8n.twistedpin.com/webhook/loyalty/forms/intake';

const WAITLIST_MODE = () => new Date() >= new Date('2026-08-15T00:00:00-05:00');

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  // IP/User-Agent for TCPA consent evidence (spec §2). clientAddress is
  // Vercel's resolved client IP; fall back to the forwarded header if unset.
  const ip =
    clientAddress ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;
  const userAgent = request.headers.get('user-agent') ?? null;

  // Trusted fields (source_channel / form_slug / offer_slug / program_tag) are
  // set HERE, never trusted from the client. The rest pass through; n8n
  // normalizes the phone + validates.
  const waitlist = WAITLIST_MODE();
  const payload = {
    source_channel: 'web_form',
    form_slug: waitlist ? 'kids-free-bowl-waitlist-2027' : 'kids-free-bowl',
    offer_slug: null,                       // windowed program grants daily — NOT at signup (waitlist: never)
    program_tag: waitlist
      ? 'program:kids-free-bowl-2027-waitlist' // marketing + early-access only — NOT enrollment
      : 'program:kids-free-bowl',              // enrollment tag the windowed segment matches on
    phone: input.phone ?? null,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    email: input.email ?? null,
    consent_marketing: input.consent_marketing === true,
    phone_type: input.phone_type ?? null,   // 'mobile'|'landline'|'voip' from Twilio Lookup (db/026)
    submission_id: input.submission_id ?? null,
    consent_language: input.consent_language ?? null,
    page_url: input.page_url ?? null,
    website_url: input.website_url ?? '',   // honeypot
    ip,
    user_agent: userAgent,
  };

  try {
    const upstream = await fetch(INTAKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Relay the loyalty response verbatim. If n8n returns non-JSON (e.g. a 5xx
    // HTML page), surface a generic error the page can show.
    const text = await upstream.text();
    try {
      const data = JSON.parse(text);
      return json(data, 200);
    } catch {
      return json({ ok: false, reason: 'upstream_error' }, 200);
    }
  } catch {
    // n8n unreachable / network failure.
    return json({ ok: false, reason: 'network_error' }, 200);
  }
};

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
