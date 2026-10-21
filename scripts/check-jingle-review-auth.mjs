// Offline only: synthetic credentials, no network or providers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  jingleReviewGate, isJingleReviewPath, issueJingleReviewToken,
  verifyJingleReviewToken, JINGLE_REVIEW_COOKIE, JINGLE_REVIEW_TTL_MS,
} from "../src/lib/jingle-review-auth.ts";

const env = { JINGLE_REVIEW_PASSWORD: "synthetic-review-password", JINGLE_REVIEW_SESSION_SECRET: randomBytes(32).toString("hex") };
const now = Date.parse("2026-10-21T20:00:00Z");
const origin = "https://review.example.test";
const get = (path, cookie) => new Request(origin + path, { headers: cookie ? { Cookie: cookie } : {} });
const post = (path, password = env.JINGLE_REVIEW_PASSWORD, headers = {}) => new Request(origin + path, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": "192.0.2.10", ...headers },
  body: new URLSearchParams({ password }),
});
let cases = 0;
function check(label, fn) { fn(); cases++; console.log(`PASS ${label}`); }
async function checkAsync(label, fn) { await fn(); cases++; console.log(`PASS ${label}`); }

check("precise protected routes, encoded route and normal-route bypass", () => {
  for (const path of ["/jingle-bowl", "/jingle-bowl/", "/jingle-bowl/jingle-square.png", "/jingle-bowl-concepts/", "/review/jingle-calendar/", "/%6aingle-bowl/", "/nye-homepage-concepts/", "/%6eye-homepage-concepts/"]) assert.equal(isJingleReviewPath(path), true);
  for (const path of ["/", "/reserve/", "/reserve/nye/", "/new-years-eve/", "/tprs-api/api/cart/", "/jingle-bowling/", "/review/other/", "/nye-homepage-concepts-other/"]) assert.equal(isJingleReviewPath(path), false);
});
await checkAsync("normal booking bypass does not require configuration", async () => assert.equal(await jingleReviewGate(get("/reserve/"), {}, now), null));
await checkAsync("missing password or secret fails closed", async () => {
  for (const config of [{}, { JINGLE_REVIEW_PASSWORD: env.JINGLE_REVIEW_PASSWORD }, { JINGLE_REVIEW_SESSION_SECRET: env.JINGLE_REVIEW_SESSION_SECRET }]) assert.equal((await jingleReviewGate(get("/jingle-bowl/"), config, now)).status, 503);
});
await checkAsync("anonymous pages get login and protected assets never get image bytes", async () => {
  for (const path of ["/jingle-bowl/", "/jingle-bowl-concepts/", "/review/jingle-calendar/", "/jingle-bowl/jingle-square.png", "/jingle-bowl/santa-entrance.webp"]) {
    const response = await jingleReviewGate(get(path), env, now);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("Cache-Control"), /private, no-store/);
    assert.match(response.headers.get("X-Robots-Tag"), /noindex/);
    assert.doesNotMatch(response.headers.get("Content-Type"), /image/);
  }
});
check("missing, malformed, tampered, expired and wrong-secret tokens fail", () => {
  const token = issueJingleReviewToken(env, now);
  for (const value of [undefined, "", "garbage", "%zz", token + ".extra", token.slice(0, -2) + "!!", "9".repeat(300)]) assert.equal(verifyJingleReviewToken(value, env, now), false);
  assert.equal(verifyJingleReviewToken(token, env, now + JINGLE_REVIEW_TTL_MS), false);
  assert.equal(verifyJingleReviewToken(token, { ...env, JINGLE_REVIEW_SESSION_SECRET: "x".repeat(64) }, now), false);
  assert.equal(verifyJingleReviewToken(token, { ...env, JINGLE_REVIEW_PASSWORD: "rotated" }, now), false);
  assert.equal(verifyJingleReviewToken(token, env, now), true);
});
await checkAsync("wrong password stays locked and never sets a cookie", async () => {
  const response = await jingleReviewGate(post("/jingle-bowl/", "wrong"), env, now);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Set-Cookie"), null);
});
await checkAsync("correct password issues signed secure HttpOnly cookie", async () => {
  const response = await jingleReviewGate(post("/jingle-bowl/"), env, now);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/jingle-bowl/");
  const cookie = response.headers.get("Set-Cookie");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=43200", "Path=/"]) assert.ok(cookie.includes(flag));
  const token = cookie.split(";")[0].split("=")[1];
  assert.equal(verifyJingleReviewToken(token, env, now), true);
});
await checkAsync("valid cookie permits all review pages/assets; duplicate cookie fails", async () => {
  const cookie = `${JINGLE_REVIEW_COOKIE}=${issueJingleReviewToken(env, now)}`;
  for (const path of ["/jingle-bowl/", "/jingle-bowl-concepts/", "/review/jingle-calendar/?month=2026-12", "/jingle-bowl/jingle-wide.webp"]) assert.equal(await jingleReviewGate(get(path, cookie), env, now), null);
  assert.equal((await jingleReviewGate(get("/jingle-bowl/", `${cookie}; ${cookie}`), env, now)).status, 401);
});
await checkAsync("redirect ignores external next/return URLs; calendar preserves only a valid month", async () => {
  assert.equal((await jingleReviewGate(post("/jingle-bowl/?next=https://evil.example&returnTo=//evil.example"), env, now)).headers.get("Location"), "/jingle-bowl/");
  assert.equal((await jingleReviewGate(post("/review/jingle-calendar/?month=2026-12&next=//evil.example"), env, now)).headers.get("Location"), "/review/jingle-calendar/?month=2026-12");
  assert.equal((await jingleReviewGate(post("/review/jingle-calendar/?month=%22%3E%3Cscript%3E"), env, now)).headers.get("Location"), "/review/jingle-calendar/");
});
await checkAsync("cross-origin login and unsupported asset writes rejected", async () => {
  assert.equal((await jingleReviewGate(post("/jingle-bowl/", env.JINGLE_REVIEW_PASSWORD, { Origin: "https://evil.example" }), env, now)).status, 403);
  assert.equal((await jingleReviewGate(post("/jingle-bowl/jingle-wide.png"), env, now)).status, 405);
});
await checkAsync("oversized request stays locked", async () => {
  const request = new Request(origin + "/jingle-bowl/", { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": "192.0.2.11" }, body: "password=" + "x".repeat(5000) });
  assert.equal((await jingleReviewGate(request, env, now)).status, 401);
});
await checkAsync("repeated failures are temporarily throttled on the serving instance", async () => {
  for (let n = 0; n < 8; n++) assert.equal((await jingleReviewGate(post("/jingle-bowl/", "wrong", { "X-Forwarded-For": "192.0.2.99" }), env, now)).status, 401);
  const limited = await jingleReviewGate(post("/jingle-bowl/", "wrong", { "X-Forwarded-For": "192.0.2.99" }), env, now);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "600");
  assert.equal((await jingleReviewGate(post("/jingle-bowl/", env.JINGLE_REVIEW_PASSWORD, { "X-Forwarded-For": "192.0.2.99" }), env, now + 601000)).status, 303);
});
check("auth source is server-only and root middleware includes protected assets", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  for (const pattern of ["/jingle-bowl/:path*", "/jingle-bowl-concepts/:path*", "/review/jingle-calendar/:path*", "/nye-homepage-concepts/:path*", "/tprs-api/:path*"]) assert.ok(source.includes(pattern));
  assert.ok(source.includes("next({ headers: JINGLE_REVIEW_HEADERS })"));
});
await checkAsync("NYE owner review gets its own title, with encoded paths also denied", async () => {
  for (const path of ["/nye-homepage-concepts/", "/%6eye-homepage-concepts/"]) {
    const response = await jingleReviewGate(get(path), env, now);
    assert.equal(response.status, 401);
    const html = await response.text();
    assert.match(html, /<title>NYE homepage preview \| Twisted Pin<\/title>/);
    assert.match(html, /action="\/nye-homepage-concepts\/"/);
    assert.doesNotMatch(html, /<h1>Jingle Bowl/);
  }
  assert.match(await (await jingleReviewGate(get('/jingle-bowl/'), env, now)).text(), /<h1>Jingle Bowl preview<\/h1>/);
});
await checkAsync("NYE missing configuration fails closed and public NYE pages bypass", async () => {
  for (const config of [{}, { JINGLE_REVIEW_PASSWORD: env.JINGLE_REVIEW_PASSWORD }, { JINGLE_REVIEW_SESSION_SECRET: env.JINGLE_REVIEW_SESSION_SECRET }]) {
    const response = await jingleReviewGate(get('/nye-homepage-concepts/'), config, now);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /<form/);
  }
  for (const path of ['/new-years-eve/', '/reserve/nye/']) assert.equal(await jingleReviewGate(get(path), {}, now), null);
});
await checkAsync("NYE login reuses signed cookie and returns only to its allowed review path", async () => {
  const response = await jingleReviewGate(post('/nye-homepage-concepts/?next=https://evil.example&month=2026-12'), env, now);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), '/nye-homepage-concepts/');
  const setCookie = response.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=43200', 'Path=/']) assert.ok(setCookie.includes(flag));
  const cookie = setCookie.split(';')[0];
  for (const path of ['/nye-homepage-concepts/', '/jingle-bowl/', '/review/jingle-calendar/']) assert.equal(await jingleReviewGate(get(path, cookie), env, now), null);
  assert.equal((await jingleReviewGate(post('/nye-homepage-concepts/', 'wrong'), env, now)).headers.get('Set-Cookie'), null);
  assert.equal((await jingleReviewGate(post('/nye-homepage-concepts/', env.JINGLE_REVIEW_PASSWORD, { Origin: 'https://evil.example' }), env, now)).status, 403);
});
console.log(`${cases} Jingle preview security checks passed. No network or provider calls.`);
