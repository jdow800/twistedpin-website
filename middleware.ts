// Vercel Routing Middleware — proxies `/tprs-api/*` to the TPRS backend
// SAME-ORIGIN, in production/preview. Dev is unaffected (it uses the
// astro.config.mjs Vite proxy).
//
// WHY MIDDLEWARE, not a vercel.json `rewrite`: vercel.json `rewrites` are
// "afterFiles" — they run AFTER the filesystem check, and the @astrojs/vercel
// adapter's Build Output config ends in a catch-all 404 that shadows them (this
// is why `vercel.json` REDIRECTS work in prod but the `/tprs-api` REWRITE 404'd:
// redirects run before the filesystem, afterFiles rewrites run after the 404).
// Routing Middleware runs BEFORE all of that, so it reliably intercepts
// `/tprs-api/*` first. Same-origin keeps the cart-token cookie host-only on
// twistedpin.com — no CORS, no cross-site cookie. `PUBLIC_TPRS_API_BASE` must
// stay UNSET so the SPA keeps calling `/tprs-api/*` (this path).

export const config = {
  // Node runtime: predictable fetch + Set-Cookie passthrough for the cart cookie.
  runtime: "nodejs",
  matcher: "/tprs-api/:path*",
};

const BACKEND = "https://api.twistedpin.com";

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = BACKEND + url.pathname.replace(/^\/tprs-api/, "") + url.search;

  // Forward the request 1:1 minus Host (fetch sets it from the target URL).
  const headers = new Headers(request.headers);
  headers.delete("host");

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstream = await fetch(target, {
    method,
    headers,
    body,
    redirect: "manual",
  });

  // Buffer the (small JSON) body and re-emit, but DROP the wire-encoding headers:
  // fetch has already decoded the body, so forwarding the upstream's
  // content-encoding / content-length / transfer-encoding makes the client
  // re-decode and TRUNCATE it (symptom: 4018-byte 4-product response arrives as
  // 888 bytes / 1 product with a bogus `Content-Length: 1`). Everything else —
  // content-type, Set-Cookie (the cart token), cache-control — passes through.
  const payload = await upstream.arrayBuffer();
  const out = new Headers(upstream.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("transfer-encoding");
  return new Response(payload, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
