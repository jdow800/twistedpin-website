/**
 * /avery-review/ gate — signed-cookie admin session.
 *
 * The Avery review dashboard shows guest conversation excerpts and proposed
 * policy changes, so it gets its own password (AVERY_REVIEW_ADMIN_PASSWORD),
 * separate from every playbook password. Same HMAC-cookie mechanics as
 * playbook-auth.ts, namespaced so tokens can never be replayed across gates.
 *
 * ⚠️ NO DEFAULT PASSWORD, ON PURPOSE — THIS REPO IS PUBLIC. Unset env var =
 * the page is off (fails closed, never open). Set AVERY_REVIEW_ADMIN_PASSWORD
 * in Vercel to turn it on.
 *
 * Signed with PLAYBOOK_SESSION_SECRET (already set in prod). The `avery:`
 * namespace in the HMAC payload keeps playbook cookies and these mutually
 * unreplayable despite the shared key.
 */

const COOKIE_NAME = 'tp_avery_review';
export const AVERY_REVIEW_COOKIE = COOKIE_NAME;

/** Short session — this is a monthly management view, not a place to live. */
const TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret(): string {
  return (
    import.meta.env.PLAYBOOK_SESSION_SECRET ||
    'tp-playbook-dev-secret-set-PLAYBOOK_SESSION_SECRET-in-prod'
  );
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function reviewConfigured(): boolean {
  return !!import.meta.env.AVERY_REVIEW_ADMIN_PASSWORD;
}

export function reviewPasswordMatches(submitted: unknown): boolean {
  const expected = import.meta.env.AVERY_REVIEW_ADMIN_PASSWORD;
  if (!expected || typeof submitted !== 'string') return false;
  const norm = (s: string) => s.replace(/ /g, ' ').trim();
  return safeEqual(norm(submitted), norm(expected));
}

export async function issueReviewToken(now = Date.now()): Promise<string> {
  const expiresAt = String(now + TTL_MS);
  return `${expiresAt}.${await hmac(`avery:${expiresAt}`)}`;
}

export async function verifyReviewToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token || !reviewConfigured()) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiresAt = token.slice(0, dot);
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= now) return false;
  return safeEqual(token.slice(dot + 1), await hmac(`avery:${expiresAt}`));
}

export function reviewCookie(token: string, isDev: boolean): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (!isDev) attrs.push('Secure');
  return attrs.join('; ');
}
