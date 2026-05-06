export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * /api/coupon-signup — server endpoint that receives the coupon form
 * submission from /coupon and forwards it to Patch Retention's
 * /v2/contacts upsert endpoint.
 *
 * Auth: Patch requires TWO headers (caught 2026-05-05 — bundle scan
 * showed `X-Account-Id` is required alongside the Bearer token):
 *   Authorization: Bearer ${PATCH_API_KEY}
 *   X-Account-Id: ${PATCH_ACCOUNT_ID}
 * Both held server-side only; browser never sees them.
 *
 * Endpoint shape (Patch v2):
 *   PATCH https://api.patchretention.com/v2/contacts?match:phone={phone}
 *   body: { first_name, last_name, email, phone, sms_on, email_on, ... }
 *   resp: 200 { ...contact } | 4xx/5xx { error }
 *
 * Trigger / DOI flow: TBD pending Patch support response. The legacy
 * iframe form does double-opt-in (verification code SMS → confirm →
 * coupon SMS). The current native form path doesn't replicate that
 * — submissions land in Patch's contact list but the coupon SMS path
 * needs the right trigger configured. Open questions sent to Patch:
 *   1. Does the API expose the DOI/verification flow?
 *   2. What's the recommended trigger pattern for "web form → coupon
 *      SMS" — contact.created event listener, custom event type, etc.?
 *   3. How is a tag attached to a contact via API (the docs only show
 *      /v2/tags as create/list of tag definitions, no contact-attach)?
 * The earlier `POST /v2/tags` step was REMOVED 2026-05-05 — that
 * endpoint creates tag definitions, doesn't attach tags to contacts.
 * Was a no-op at best.
 *
 * Birthday: Patch's dashboard shows the field as MM/DD/YYYY (date
 * type), so we need a parseable date string. We collect MM/DD only
 * on the form (year is irrelevant for birthday-month/day offers and
 * we don't want to ask for it), and append a placeholder year (1900)
 * before sending. Birthday-month / birthday-day automations behave
 * identically; only year-based queries return 1900 for everyone,
 * which is fine because we don't run any.
 *
 * Required env vars (set in Vercel):
 *   PATCH_API_KEY     — Bearer token from Patch dashboard
 *   PATCH_ACCOUNT_ID  — Account ID from Patch dashboard (sent as
 *                       X-Account-Id header on every request)
 */

const PATCH_BASE = 'https://api.patchretention.com';

interface SignupPayload {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  birthday: string;  // user-entered "MM/DD" — server normalizes to "MM/DD/1900"
  consent: boolean;
}

/** Placeholder year sent to Patch for birthday — see file header. */
const BIRTHDAY_PLACEHOLDER_YEAR = '1900';

/**
 * Normalize a US phone number to digits only with leading "1" country
 * code. Patch examples show "11234567890" — 11 digits with the country
 * code prefix. Strips formatting characters.
 */
function normalizePhone(input: string): string | null {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.PATCH_API_KEY;
  const accountId = import.meta.env.PATCH_ACCOUNT_ID;
  if (!apiKey || !accountId) {
    console.error('[coupon-signup] PATCH_API_KEY or PATCH_ACCOUNT_ID not configured');
    return jsonError('Signup is temporarily unavailable. Please text 815-782-7790 to claim your code.', 503);
  }

  let payload: SignupPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid request body');
  }

  // ---- Validation ----
  const firstName = String(payload.first_name || '').trim();
  const lastName  = String(payload.last_name  || '').trim();
  const email     = String(payload.email      || '').trim();
  if (!firstName) return jsonError('First name is required');
  if (!lastName)  return jsonError('Last name is required');
  if (!email || !isValidEmail(email)) return jsonError('Please enter a valid email address');

  const phone = normalizePhone(payload.phone);
  if (!phone) return jsonError('Please enter a valid US mobile number');

  if (!payload.consent) {
    return jsonError('Please agree to the messaging terms to receive your code');
  }

  // Birthday: parse user-entered "MM/DD" (or "MM / DD" with whitespace)
  // and pad with a placeholder year so Patch's date field accepts it.
  // See file header for the year-placeholder rationale.
  let birthday: string | null = null;
  const bdayMatch = String(payload.birthday || '').match(
    /^\s*(0?[1-9]|1[0-2])\s*\/\s*(0?[1-9]|[12]\d|3[01])\s*$/,
  );
  if (bdayMatch) {
    const m = bdayMatch[1].padStart(2, '0');
    const d = bdayMatch[2].padStart(2, '0');
    birthday = `${m}/${d}/${BIRTHDAY_PLACEHOLDER_YEAR}`;
  } else if (payload.birthday) {
    return jsonError('Please enter your birthday as MM/DD (for example, 04/17)');
  }

  // ---- Build Patch upsert request ----
  const body: Record<string, unknown> = {
    first_name: firstName,
    last_name:  lastName,
    email,
    phone,
    sms_on: true,
    email_on: true,
  };
  if (birthday) body.birthday = birthday;

  const upsertUrl = `${PATCH_BASE}/v2/contacts?match:phone=${encodeURIComponent(phone)}`;

  let upsertRes: Response;
  try {
    upsertRes = await fetch(upsertUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Account-Id': accountId,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[coupon-signup] network error calling Patch:', err);
    return jsonError('We had trouble reaching the signup system. Please try again, or text 815-782-7790.', 502);
  }

  if (!upsertRes.ok) {
    const errorBody = await upsertRes.text().catch(() => '');
    console.error('[coupon-signup] Patch upsert failed:', upsertRes.status, errorBody);
    return jsonError('Signup failed. Please try again, or text 815-782-7790.', 502);
  }

  // Trigger step (TBD): the legacy iframe form does double-opt-in
  // and ties the coupon SMS to a verified contact. The right API
  // pattern for replicating that is pending Patch support response —
  // see file header for the open questions. Until we hear back,
  // submissions land in Patch's contact list and ops can either:
  //   (a) configure a Patch automation listening for `contact.created`
  //       to fire the coupon SMS (would fire on ANY new contact —
  //       fine if /coupon is the only public signup that creates
  //       contacts via API)
  //   (b) backfill manually until the right trigger pattern is wired
  //
  // The earlier `POST /v2/tags` call here was REMOVED — that endpoint
  // creates tag definitions, doesn't attach tags to contacts. There
  // is no "apply tag to contact" endpoint in the v2 API.

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
