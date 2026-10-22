/** Server-only review gate. Never import into a React island or public script.
 * Mirrors the existing review cookie pattern with a dedicated signing secret.
 * Missing configuration fails closed; passwords/secrets are never in source. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const JINGLE_REVIEW_COOKIE = "tp_jingle_review";
export const JINGLE_REVIEW_TTL_MS = 12 * 60 * 60 * 1000;
const PAGE_PATHS = new Set(["/jingle-bowl/", "/jingle-bowl/booking/", "/jingle-bowl-concepts/", "/review/jingle-calendar/", "/nye-homepage-concepts/"]);
const PREFIXES = ["/jingle-bowl", "/jingle-bowl-concepts", "/review/jingle-calendar", "/nye-homepage-concepts"];
type ReviewEnv = { JINGLE_REVIEW_PASSWORD?: string; JINGLE_REVIEW_SESSION_SECRET?: string };
const failedAttempts = new Map<string, { count: number; until: number }>();
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

export const JINGLE_REVIEW_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex",
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
} as const;

function decodedPath(pathname: string): string {
  try { return decodeURIComponent(pathname); } catch { return pathname; }
}

export function isJingleReviewPath(pathname: string): boolean {
  const path = decodedPath(pathname);
  return PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function pagePath(pathname: string): string | null {
  const path = decodedPath(pathname).replace(/\/+$/, "") + "/";
  return PAGE_PATHS.has(path) ? path : null;
}

function configured(env: ReviewEnv): env is Required<ReviewEnv> {
  return !!env.JINGLE_REVIEW_PASSWORD && (env.JINGLE_REVIEW_SESSION_SECRET?.length ?? 0) >= 32;
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

function signature(expiry: string, env: Required<ReviewEnv>): string {
  // Password rotation invalidates prior cookies without exposing the password.
  const version = createHash("sha256").update(env.JINGLE_REVIEW_PASSWORD).digest("hex");
  return createHmac("sha256", env.JINGLE_REVIEW_SESSION_SECRET)
    .update(`jingle-review:v1:${expiry}:${version}`).digest("base64url");
}

export function issueJingleReviewToken(env: ReviewEnv, now = Date.now()): string {
  if (!configured(env)) throw new Error("Jingle review gate is not configured");
  const expiry = String(now + JINGLE_REVIEW_TTL_MS);
  return `${expiry}.${signature(expiry, env)}`;
}

export function verifyJingleReviewToken(token: string | undefined, env: ReviewEnv, now = Date.now()): boolean {
  if (!configured(env) || !token || token.length > 100) return false;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires <= now || expires > now + JINGLE_REVIEW_TTL_MS) return false;
  return safeEqual(match[2], signature(match[1], env));
}

function tokenFromRequest(request: Request): string | undefined {
  const tokens = (request.headers.get("cookie") ?? "").split(";")
    .map(part => part.trim()).filter(part => part.startsWith(`${JINGLE_REVIEW_COOKIE}=`));
  return tokens.length === 1 ? tokens[0].slice(JINGLE_REVIEW_COOKIE.length + 1) : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Redirect only to an allowlisted review page; caller-supplied next/return URLs
 * are ignored. Calendar retains only a valid month, never an arbitrary query. */
export function jingleReviewReturnPath(url: URL): string {
  const path = pagePath(url.pathname) ?? "/jingle-bowl/";
  const month = url.searchParams.get("month");
  return path === "/review/jingle-calendar/" && month && /^20\d{2}-(0[1-9]|1[0-2])$/.test(month)
    ? `${path}?month=${month}` : path;
}

function loginResponse(action: string, status: number, message = "Enter the preview password to continue."): Response {
  const title = action === "/nye-homepage-concepts/" ? "NYE homepage preview" : "Jingle Bowl preview";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${title} | Twisted Pin</title><style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#100c1f;color:#f7f2e8;font:16px/1.6 system-ui,sans-serif;min-height:100dvh;display:grid;place-items:center;padding:24px}main{width:min(100%,420px);padding:32px;border:1px solid #494154;border-radius:14px;background:#1b1627}small{color:#4eecc4;font-weight:700;letter-spacing:.12em}h1{font-size:34px;line-height:1.1;margin:18px 0}p{color:#d4cddc}label{display:block;margin:22px 0 8px;font-weight:600}input,button{font:inherit;width:100%;padding:13px 15px;border:1px solid #7a7089;border-radius:7px}input{background:#100c1f;color:#fff}button{margin-top:16px;background:#4eecc4;border-color:#4eecc4;color:#101914;font-weight:700;cursor:pointer}:focus-visible{outline:3px solid #ffe236;outline-offset:4px}</style></head><body><main><small>TWISTED PIN · REVIEW</small><h1>${title}</h1><p role="status">${escapeHtml(message)}</p>${status !== 503 ? `<form method="post" action="${escapeHtml(action)}"><label for="review-password">Password</label><input id="review-password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Open preview</button></form>` : ""}</main></body></html>`;
  return new Response(html, { status, headers: { ...JINGLE_REVIEW_HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}

function simpleResponse(message: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(message, { status, headers: { ...JINGLE_REVIEW_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra } });
}

async function readPassword(request: Request): Promise<string | null> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded")) return null;
  if (Number(request.headers.get("content-length")) > 4096 || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const values = form.getAll("password");
  return values.length === 1 && values[0].length <= 256 ? values[0] : null;
}

/** null means authorized or outside this gate. The caller must apply the same
 * private/no-store headers when continuing a protected response. */
export async function jingleReviewGate(request: Request, env: ReviewEnv = process.env, now = Date.now()): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isJingleReviewPath(url.pathname)) return null;
  const page = pagePath(url.pathname);
  const action = jingleReviewReturnPath(url);
  if (!configured(env)) return page ? loginResponse(action, 503, "This preview is temporarily unavailable.") : simpleResponse("Preview unavailable", 503);
  const method = request.method.toUpperCase();
  // The development-only rehearsal proxy also needs authenticated mutations.
  // This exception is loopback-only; the route independently requires DEV and
  // its exact isolated transport configuration before contacting any backend.
  if (decodedPath(url.pathname).startsWith('/jingle-bowl/rehearsal-api/')
    && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    && ['POST', 'DELETE'].includes(method)) {
    if (!verifyJingleReviewToken(tokenFromRequest(request), env, now)) return simpleResponse('Preview authorization required', 401);
    if (request.headers.get('origin') !== url.origin) return simpleResponse('Invalid request origin', 403);
    return null;
  }
  if (method === "GET" || method === "HEAD") {
    if (verifyJingleReviewToken(tokenFromRequest(request), env, now)) return null;
    const response = page ? loginResponse(action, 401) : simpleResponse("Preview authorization required", 401);
    return method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
  if (method !== "POST" || !page) return simpleResponse("Method not allowed", 405, { Allow: page ? "GET, HEAD, POST" : "GET, HEAD" });
  if (request.headers.get("origin") !== url.origin) return simpleResponse("Invalid request origin", 403);

  // Small per-instance mitigation, not a claimed distributed rate limiter.
  // Vercel supplies x-forwarded-for; no IP or password is logged or persisted.
  const client = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 100);
  for (const [key, value] of failedAttempts) if (value.until <= now) failedAttempts.delete(key);
  const prior = failedAttempts.get(client);
  if (prior && prior.count >= 8) return simpleResponse("Too many attempts. Please try again later.", 429, { "Retry-After": String(Math.ceil((prior.until - now) / 1000)) });
  let submitted: string | null = null;
  try { submitted = await readPassword(request); } catch { /* malformed body */ }
  if (submitted === null || !safeEqual(submitted, env.JINGLE_REVIEW_PASSWORD)) {
    if (!prior && failedAttempts.size >= 5000) failedAttempts.delete(failedAttempts.keys().next().value!);
    failedAttempts.set(client, { count: (prior?.count ?? 0) + 1, until: prior?.until ?? now + ATTEMPT_WINDOW_MS });
    return loginResponse(action, 401, "That password didn't match. Please try again.");
  }
  failedAttempts.delete(client);
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const cookie = `${JINGLE_REVIEW_COOKIE}=${issueJingleReviewToken(env, now)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${JINGLE_REVIEW_TTL_MS / 1000}${local ? "" : "; Secure"}`;
  return new Response(null, { status: 303, headers: { ...JINGLE_REVIEW_HEADERS, Location: action, "Set-Cookie": cookie } });
}
