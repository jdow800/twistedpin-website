// Dev-only, ALLOW-LISTED reverse proxy for exposing ONLY the read endpoints the
// deployed /tprs preview needs, through a cloudflare quick tunnel.
//
// Security posture: a tunnel exposes whatever it points at to the public
// internet. So this proxy does NOT forward the whole backend — it forwards only
// the specific read endpoints the booking preview uses (catalog + availability +
// the read-only coupon-preview), and rejects everything else (writes, checkout
// convert, admin, avery) with 403. Worst case if the random tunnel URL leaks:
// someone reads public catalog/availability data — the same thing any customer
// sees on a booking page. No writes, no admin surface, no payment routes.
//
// It also strips the trailing slash the client appends (trailingSlash:'always')
// so paths match the backend's no-slash Fastify routes — same as the Vite dev
// proxy. Same-origin via the vercel.json rewrite means CORS isn't needed.
//
// Run: node scripts/tprs-tunnel-proxy.mjs   (then tunnel :3100 with cloudflared)
// Throwaway phone-testing infra — not part of the production app.

import http from "node:http";

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 3000;
const LISTEN_PORT = Number(process.env.PROXY_PORT ?? 3100);

// Allow-list: [method, path-regex]. Only these reach the backend.
const ALLOW = [
  ["GET", /^\/health$/],
  ["GET", /^\/api\/products\/bookable$/],
  ["GET", /^\/api\/products$/], // ?codes=
  ["GET", /^\/api\/products\/[0-9a-fA-F-]{36}\/forms$/],
  ["GET", /^\/api\/availability$/],
  ["GET", /^\/api\/availability\/month$/],
  ["POST", /^\/api\/checkout\/coupon-preview$/],
];

const server = http.createServer((req, res) => {
  const raw = req.url ?? "/";
  const qIdx = raw.indexOf("?");
  let path = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const query = qIdx === -1 ? "" : raw.slice(qIdx);
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  const method = (req.method ?? "GET").toUpperCase();
  const allowed = ALLOW.some(([m, re]) => m === method && re.test(path));
  if (!allowed) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "endpoint not exposed by /tprs preview proxy" }));
    return;
  }

  const proxyReq = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method,
      path: path + query,
      headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`tprs proxy error: ${e.message}`);
  });
  req.pipe(proxyReq);
});

server.listen(LISTEN_PORT, () => {
  console.log(`tprs allow-listed tunnel proxy on :${LISTEN_PORT} → :${TARGET_PORT}`);
});
