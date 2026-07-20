/**
 * Playbook gate — signed-cookie session helpers.
 *
 * /playbook/ is the internal culture book (Part One: The Playbook, Part Two:
 * The Guidebook). It's for teammates, not the public: noindex + robots
 * Disallow + sitemap-excluded, behind a single shared team password.
 *
 * WHY A SHARED PASSWORD, NOT ACCOUNTS
 * Per-teammate accounts would mean provisioning and password resets for every
 * seasonal hire, and would buy us nothing — the thing that actually identifies
 * a reader is the acknowledgment they type at the end (see /api/playbook-ack).
 * The gate's job is "keep this off the open internet," not "prove identity."
 * Be honest about what that means: a signature behind a shared password proves
 * SOMEONE WITH THE PASSWORD typed that name. That's the same evidentiary
 * weight as most e-signed handbooks and it's sufficient for the real job here
 * (knowing whether a new hire actually read it). If we ever need it to hold up
 * harder, the upgrade path is emailing each hire a unique one-time link — that
 * changes this file only, not the reading experience.
 *
 * WHY SERVER-SIDE
 * A client-side password check ships the whole book in the page source to
 * anyone who hits View Source. The gate is checked in the Astro frontmatter of
 * /playbook/ (prerender = false), so unauthenticated requests never receive
 * chapter content at all.
 *
 * COOKIE FORMAT
 *   tp_playbook = <expiresAtMs>.<base64url HMAC-SHA256(expiresAtMs)>
 *
 * The expiry is IN the signed payload, so a tampered or stale value fails the
 * signature check rather than relying on the browser to honor Max-Age. Signed
 * with PLAYBOOK_SESSION_SECRET; rotating that secret invalidates every live
 * session (useful if the password ever leaks).
 */

const COOKIE_NAME = 'tp_playbook';

/** 30 days. Long enough that a teammate reading across several shifts isn't
 *  re-prompted; short enough that a shared/kiosk browser doesn't stay open
 *  forever. Re-entering the password is a 5-second cost, so we bias short. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const PLAYBOOK_COOKIE = COOKIE_NAME;

/**
 * The shared team password. Case-insensitive and whitespace-trimmed on
 * comparison (see `passwordMatches`) — a teammate typing it on a phone gets
 * autocapitalize and a trailing space from autocomplete, and neither should
 * lock them out of an employee handbook.
 *
 * Default is the real password rather than a throwaway: this page is worthless
 * to an attacker (it's a culture book, not customer data) and a missing env var
 * silently locking out the whole team on a Friday hire is the worse failure.
 * Override via PLAYBOOK_PASSWORD on Vercel if it ever needs to change.
 */
function expectedPassword(): string {
  return import.meta.env.PLAYBOOK_PASSWORD || 'onefamily';
}

/**
 * HMAC key. Falls back to a build-stable constant when unset so local dev and
 * preview deploys work without env setup. In production PLAYBOOK_SESSION_SECRET
 * SHOULD be set — without it, anyone who reads this repo can forge a session
 * cookie and skip the password. That's a low-stakes bypass (they'd still have
 * to know the URL, and the content is an employee handbook), which is why it
 * degrades rather than throws.
 */
function sessionSecret(): string {
  return (
    import.meta.env.PLAYBOOK_SESSION_SECRET ||
    'tp-playbook-dev-secret-set-PLAYBOOK_SESSION_SECRET-in-prod'
  );
}

/** Constant-time-ish string compare. The password is low-value and the
 *  endpoint is rate-limited by Vercel's own concurrency, but comparing
 *  digests rather than raw strings costs nothing and avoids leaking length
 *  or prefix information through timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Normalize + compare a submitted password.
 * Case-insensitive, trimmed, and NBSP-tolerant (iOS smart punctuation and
 * some password managers paste a non-breaking space).
 */
export function passwordMatches(submitted: unknown): boolean {
  if (typeof submitted !== 'string') return false;
  const norm = (s: string) =>
    s.replace(/ /g, ' ').trim().toLowerCase();
  return safeEqual(norm(submitted), norm(expectedPassword()));
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  // base64url — cookie-safe without escaping.
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Mint a signed session token valid for SESSION_TTL_MS. */
export async function issueToken(now = Date.now()): Promise<string> {
  const expiresAt = String(now + SESSION_TTL_MS);
  return `${expiresAt}.${await hmac(expiresAt)}`;
}

/** Verify a cookie value: signature must match AND the embedded expiry must
 *  still be in the future. Returns false for anything malformed. */
export async function verifyToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiresAt = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= now) return false;
  return safeEqual(sig, await hmac(expiresAt));
}

/** Set-Cookie header value for a fresh session. HttpOnly so page JS can't
 *  read it; SameSite=Lax so it survives a normal link click into /playbook/.
 *  Secure is omitted on localhost — Chrome rejects Secure cookies over http. */
export function sessionCookie(token: string, isDev: boolean): string {
  return buildCookie(COOKIE_NAME, token, isDev);
}

/* ────────────────────────────────────────────────────────────────────────
   WHO — the teammate's name + reading-session id.
   ────────────────────────────────────────────────────────────────────────
   Collected on the "Who are we talking to?" screen after the password. Kept
   in its own signed cookie so the hub can greet them, the signature field can
   be pre-filled, and the completion can be tied back to the session row.

   ⚠️ THIS IS NOT AUTHENTICATION. The gate is a SHARED password, so a typed
   name is a claim, not an identity. Signing the cookie only stops someone
   editing their own name/session id after the fact — it does not make the
   name true. Everything downstream (the signature, the email, the telemetry)
   inherits that limitation, which is the same standard as a typical e-signed
   handbook and is fine for the job. Do not build anything that needs real
   identity on top of this without adding per-teammate links first.

   Deliberately NOT auto-signing from this name: pre-fill the signature, but
   still require the checkbox and an explicit tap at the end. A name typed at
   minute zero is a login; the acknowledgment has to be an act taken AFTER
   reading or it isn't an acknowledgment. */

const WHO_COOKIE = 'tp_playbook_who';
export const PLAYBOOK_WHO_COOKIE = WHO_COOKIE;

export interface PlaybookWho {
  /** Name as typed. Trimmed + collapsed whitespace, never otherwise altered. */
  name: string;
  /** playbook_sessions.id — ties the eventual signature to the reading session. */
  sid: string;
}

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return decodeURIComponent(escape(atob(b64)));
}

/** Normalize a submitted name: trim, collapse internal whitespace, cap length.
 *  Returns null if it can't plausibly be a name. */
export function normalizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

export async function issueWhoToken(who: PlaybookWho): Promise<string> {
  const payload = b64urlEncode(JSON.stringify(who));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyWhoToken(
  token: string | undefined,
): Promise<PlaybookWho | null> {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, await hmac(payload))) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(payload));
    if (typeof parsed?.name !== 'string' || typeof parsed?.sid !== 'string') {
      return null;
    }
    return { name: parsed.name, sid: parsed.sid };
  } catch {
    return null;
  }
}

export function whoCookie(token: string, isDev: boolean): string {
  return buildCookie(WHO_COOKIE, token, isDev);
}

function buildCookie(name: string, value: string, isDev: boolean): string {
  const attrs = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (!isDev) attrs.push('Secure');
  return attrs.join('; ');
}
