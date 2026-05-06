export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * /api/coupon-signup — server endpoint that receives the coupon form
 * submission from /coupon and forwards it to Patch Retention's
 * /v2/contacts upsert endpoint.
 *
 * Auth: Patch uses `Authorization: Bearer ${apiToken}`. Token is held
 * server-side only (PATCH_API_KEY env var); browser never sees it.
 *
 * Endpoint shape (Patch v2):
 *   PATCH https://api.patchretention.com/v2/contacts?match:phone={phone}
 *   body: { first_name, last_name, email, phone, sms_on, email_on, ... }
 *   resp: 200 { ...contact } | 4xx/5xx { error }
 *
 * Tag-driven coupon flow: after upsert, we apply a tag (PATCH_TAG env
 * var, e.g. "coupon_10_lane") so Patch's automation triggers the SMS
 * with the actual coupon code. The tag → SMS mapping is configured
 * by ops in the Patch dashboard. If the env var is unset, we skip the
 * tag step and the contact is still created — useful for staging.
 *
 * Birthday: Patch's default upsert body doesn't include `birthday`.
 * We send it as `birthday: "MM-DD"` and ops verifies in Patch that
 * the custom field exists with that key + format. Patch typically
 * ignores unknown fields silently, so this is safe to send blindly.
 *
 * Required env vars (set in Vercel):
 *   PATCH_API_KEY   — Bearer token from Patch dashboard
 *   PATCH_TAG       — (optional) tag name applied to new signups,
 *                      e.g. "coupon_10_lane". Patch automation
 *                      triggers off this tag.
 */

const PATCH_BASE = 'https://api.patchretention.com';

interface SignupPayload {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  birth_month: string;
  birth_day: string;
  consent: boolean;
}

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
  if (!apiKey) {
    console.error('[coupon-signup] PATCH_API_KEY not configured');
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

  // Birthday: optional. If both month + day present, send as MM-DD.
  // Ops verifies the custom field name in Patch dashboard; if Patch
  // expects a different key, swap below.
  let birthday: string | null = null;
  if (payload.birth_month && payload.birth_day) {
    const m = String(payload.birth_month).padStart(2, '0');
    const d = String(payload.birth_day).padStart(2, '0');
    if (/^\d{2}$/.test(m) && /^\d{2}$/.test(d)) birthday = `${m}-${d}`;
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

  const contact = (await upsertRes.json().catch(() => null)) as { _id?: string } | null;
  const contactId = contact?._id;

  // ---- Optional tag application ----
  // Patch's automation fires off a tag — this is the "trigger the
  // coupon SMS" step. Tag name configured by ops via PATCH_TAG env var.
  // If the env var is unset OR the tag step fails, the contact is
  // still created — we treat tag failure as a soft error, log it, and
  // return success to the user so they don't think their signup
  // didn't go through. Ops can backfill via dashboard if needed.
  const tagName = import.meta.env.PATCH_TAG;
  if (tagName && contactId) {
    try {
      await fetch(`${PATCH_BASE}/v2/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ contact_id: contactId, name: tagName }),
      });
    } catch (err) {
      console.warn('[coupon-signup] tag application failed (soft error):', err);
    }
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
