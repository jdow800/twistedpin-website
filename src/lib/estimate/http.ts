/**
 * Event Builder estimate — HTTP plumbing shared by the two routes.
 *
 * CORS: the page lives on menu.twistedpin.com (a Zite app) and its editor
 * preview on a zite.* origin, so these are cross-origin GETs. A browser
 * Origin outside the allow-list gets a 403; the 200s carry `*` so the edge
 * cache can hand one cached body to every allowed origin (a per-origin
 * `Access-Control-Allow-Origin` would poison the cache for the next origin).
 * The Origin check is a fence against other sites embedding the estimator,
 * not a security boundary — nothing here is secret.
 *
 * Cache: successful estimates are edge-cached for a day (a repeated
 * combination never reaches the engine; the 4 AM rebuild purges). Errors are
 * never cached, so a transient engine failure can't be pinned to a URL.
 *
 * Pure module: no env, no `astro:*` imports.
 */

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://menu.twistedpin.com",
  "https://www.twistedpin.com",
  "https://twistedpin.com",
];

/** Zite hosts previews and unpublished builds on its own domains. */
export const ALLOWED_ORIGIN_SUFFIXES: readonly string[] = [".zite.so", ".zite.com"];

export const CACHE_OK = "public, s-maxage=86400, stale-while-revalidate=3600";
export const CACHE_NONE = "no-store";

export function parseAllowedOrigins(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** No Origin header (same-origin navigation, curl, server-to-server) is allowed through. */
export function originAllowed(origin: string | null, extra: readonly string[] = []): boolean {
  if (!origin) return true;
  let host: string;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && !/^https?:\/\/localhost(:\d+)?$/.test(origin)) return false;
    host = u.hostname;
  } catch {
    return false;
  }
  const o = origin.replace(/\/+$/, "");
  if (DEFAULT_ALLOWED_ORIGINS.includes(o) || extra.includes(o)) return true;
  if (host === "localhost") return true;
  return ALLOWED_ORIGIN_SUFFIXES.some((suf) => host.endsWith(suf));
}

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    // POST added 2026-09-04: the Calculate beacon (POST /api/estimate/track/) preflights, and a preflight that omits
    // POST is refused by the browser - the beacon then drops silently (curl never preflights, so the live test passed).
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(body: unknown, status: number, cache: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Same convention as the other /api routes: robots.txt already disallows /api/, this covers a linked URL.
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": cache,
      ...corsHeaders(),
      ...extra,
    },
  });
}

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Best-effort per-instance token bucket. Serverless instances don't share
// memory, so this bounds a single hot instance, not the world — the edge
// cache is the real shield. 60 requests / minute / IP is far above a human
// pressing Calculate.
const BUCKET_CAPACITY = 60;
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000;
const buckets = new Map<string, { tokens: number; at: number }>();

export function rateLimited(ip: string, now: number = Date.now()): boolean {
  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: BUCKET_CAPACITY, at: now };
    buckets.set(ip, b);
  }
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + (now - b.at) * REFILL_PER_MS);
  b.at = now;
  if (b.tokens < 1) return true;
  b.tokens -= 1;
  if (buckets.size > 5_000) {
    // Cheap eviction: drop the oldest half when the map gets large.
    const entries = [...buckets.entries()].sort((x, y) => x[1].at - y[1].at);
    for (const [k] of entries.slice(0, entries.length >> 1)) buckets.delete(k);
  }
  return false;
}
