// Offline production-entrypoint smoke: emit separate ESM files as Vercel's
// Node builder does, then let Node resolve imports (no bundler masking errors).
// Uses synthetic credentials and an in-memory upstream; never contacts TPRS.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname, relative, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratchRoot = join(root, ".shots");
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(join(scratchRoot, "middleware-smoke-"));
const originalFetch = globalThis.fetch;
const originalEnv = {
  JINGLE_REVIEW_PASSWORD: process.env.JINGLE_REVIEW_PASSWORD,
  JINGLE_REVIEW_SESSION_SECRET: process.env.JINGLE_REVIEW_SESSION_SECRET,
};
let cases = 0;
const pass = label => { cases++; console.log(`PASS ${label}`); };
try {
  for (const path of ["middleware.ts", "src/lib/jingle-review-auth.ts"]) {
    const source = await readFile(join(root, path), "utf8");
    const dest = join(scratch, path.replace(/\.ts$/, ".js"));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, stripTypeScriptTypes(source));
  }
  await writeFile(join(scratch, "package.json"), '{"type":"module"}');
  const { default: middleware, config } = await import(pathToFileURL(join(scratch, "middleware.js")));
  assert.equal(typeof middleware, "function");
  assert.equal(config.runtime, "nodejs");
  pass("emitted Node ESM middleware starts with all imports resolved");

  delete process.env.JINGLE_REVIEW_PASSWORD;
  delete process.env.JINGLE_REVIEW_SESSION_SECRET;
  assert.equal((await middleware(new Request("https://preview.example/jingle-bowl/"))).status, 503);
  assert.equal((await middleware(new Request("https://preview.example/nye-homepage-concepts/"))).status, 503);
  pass("unconfigured review fails closed without a startup exception");

  const calls = [];
  globalThis.fetch = async (target, init) => {
    calls.push({ target, init });
    return new Response('{"ok":true}', { headers: {
      "Content-Type": "application/json", "Set-Cookie": "cart_token=synthetic; HttpOnly; Path=/",
      "Cache-Control": "no-store", "Content-Encoding": "gzip", "Content-Length": "1", "Transfer-Encoding": "chunked",
    } });
  };
  const health = await middleware(new Request("https://preview.example/tprs-api/health/?check=1", { headers: { Host: "preview.example", Cookie: "cart_token=synthetic" } }));
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(calls[0].target, "https://api.twistedpin.com/health/?check=1");
  assert.equal(calls[0].init.headers.has("host"), false);
  assert.equal(calls[0].init.headers.get("cookie"), "cart_token=synthetic");
  assert.equal(health.headers.get("set-cookie"), "cart_token=synthetic; HttpOnly; Path=/");
  for (const name of ["content-encoding", "content-length", "transfer-encoding"]) assert.equal(health.headers.get(name), null);
  pass("ordinary API proxy works with review config absent and preserves cart cookie");

  await middleware(new Request("https://preview.example/tprs-api/api/cart/?request=2", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"synthetic":true}' }));
  assert.equal(calls[1].target, "https://api.twistedpin.com/api/cart/?request=2");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(new TextDecoder().decode(calls[1].init.body), '{"synthetic":true}');
  assert.equal(calls[1].init.redirect, "manual");
  pass("ordinary API POST body, query and manual redirects remain intact");

  process.env.JINGLE_REVIEW_PASSWORD = "synthetic-password";
  process.env.JINGLE_REVIEW_SESSION_SECRET = randomBytes(32).toString("hex");
  for (const path of ["/jingle-bowl/", "/jingle-bowl-concepts/", "/review/jingle-calendar/", "/jingle-bowl/jingle-wide.webp", "/%6aingle-bowl/jingle-wide.webp", "/nye-homepage-concepts/", "/%6eye-homepage-concepts/"]) {
    assert.equal((await middleware(new Request("https://preview.example" + path))).status, 401);
  }
  pass("real middleware denies anonymous pages and campaign assets");
  const login = await middleware(new Request("https://preview.example/jingle-bowl/", {
    method: "POST", headers: { Origin: "https://preview.example", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: process.env.JINGLE_REVIEW_PASSWORD }),
  }));
  assert.equal(login.status, 303);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const authorized = await middleware(new Request("https://preview.example/jingle-bowl/", { headers: { Cookie: cookie } }));
  assert.equal(authorized.headers.get("x-middleware-next"), "1");
  assert.match(authorized.headers.get("Cache-Control"), /private, no-store/);
  assert.match(authorized.headers.get("X-Robots-Tag"), /noindex/);
  assert.equal(calls.length, 2);
  pass("real middleware login continues protected responses without API fetches");
  const nyeLogin = await middleware(new Request("https://preview.example/nye-homepage-concepts/?next=//evil.example", {
    method: "POST", headers: { Origin: "https://preview.example", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: process.env.JINGLE_REVIEW_PASSWORD }),
  }));
  assert.equal(nyeLogin.status, 303);
  assert.equal(nyeLogin.headers.get('Location'), '/nye-homepage-concepts/');
  const nyeCookie = nyeLogin.headers.get('set-cookie').split(';')[0];
  for (const path of ['/nye-homepage-concepts/', '/jingle-bowl/jingle-wide.webp', '/review/jingle-calendar/?month=2026-12']) {
    const response = await middleware(new Request('https://preview.example' + path, { headers: { Cookie: nyeCookie } }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  }
  const calendarLogin = await middleware(new Request('https://preview.example/review/jingle-calendar/?month=2026-12&next=//evil.example', {
    method: 'POST', headers: { Origin: 'https://preview.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password: process.env.JINGLE_REVIEW_PASSWORD }),
  }));
  assert.equal(calendarLogin.headers.get('Location'), '/review/jingle-calendar/?month=2026-12');
  assert.equal(calls.length, 2);
  assert.ok(config.matcher.includes('/nye-homepage-concepts/:path*'));
  pass('NYE review shares signed login while Jingle assets and calendar return remain unchanged');
  console.log(`${cases} routing middleware checks passed.`);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  // Only remove the unique temporary directory created under this worktree.
  const cleanupPath = relative(scratchRoot, scratch);
  assert.ok(cleanupPath && !cleanupPath.startsWith("..") && !isAbsolute(cleanupPath));
  await rm(scratch, { recursive: true, force: true });
}
