// Anonymous requests through the actual emitted Astro server and static output.
// No real API, credentials, holds, payment or external requests are used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.fetch = async () => { throw new Error('Outbound fetch forbidden in public build check'); };
delete process.env.JINGLE_BOOKING_ENABLED;
process.env.JINGLE_REVIEW_PASSWORD = 'synthetic-public-build-review';
process.env.JINGLE_REVIEW_SESSION_SECRET = 'synthetic-public-build-secret-20261022-only';
const { default: app } = await import('../.vercel/output/functions/_render.func/dist/server/entry.mjs');
let checks = 0;
const check = (label, ok) => { assert.ok(ok, label); checks++; };
const get = path => app.fetch(new Request('https://www.twistedpin.com' + path));
const landing = await get('/jingle-bowl/');
const html = await landing.text();
check('anonymous landing succeeds', landing.status === 200);
check('landing is indexable', !/noindex/i.test(landing.headers.get('x-robots-tag') ?? '') && !/<meta[^>]+name="robots"[^>]+noindex/i.test(html));
check('landing canonical', /rel="canonical"[^>]+href="https:\/\/www.twistedpin.com\/jingle-bowl\/"/.test(html));
check('both lane buttons connect', html.includes('/jingle-bowl/booking/?lane=traditional') && html.includes('/jingle-bowl/booking/?lane=vip'));
check('approved share image', html.includes('https://www.twistedpin.com/jingle-bowl/jingle-wide.png'));
const schema = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const event = schema.find(item => item['@type'] === 'Event');
check('event metadata present', !!event);
check('event starts and ends match approved activities', new Date(event.startDate).toISOString() === '2026-12-06T19:45:00.000Z' && new Date(event.endDate).toISOString() === '2026-12-06T23:15:00.000Z');
check('event does not invent stock', !JSON.stringify(event).includes('InStock'));
check('breadcrumb metadata', schema.some(item => item['@type'] === 'BreadcrumbList'));
for (const lane of ['traditional', 'vip']) {
  const response = await get('/jingle-bowl/booking/?lane=' + lane), body = await response.text();
  check(lane + ' anonymous booking succeeds', response.status === 200);
  check(lane + ' checkout has private no-store headers', /private/.test(response.headers.get('cache-control')) && /no-store/.test(response.headers.get('cache-control')));
  check(lane + ' checkout remains noindex', /noindex/.test(response.headers.get('x-robots-tag')) && /<meta[^>]+name="robots"[^>]+noindex/i.test(body));
  check(lane + ' uses real public checkout', body.includes('JinglePublicCheckout') && !body.includes('JingleRehearsal'));
  check(lane + ' has no marketing trackers', !/<script[^>]+src="[^"]*(?:googletagmanager|google-analytics|clarity|insights\/script)/i.test(body));
}
for (const path of ['/jingle-bowl-concepts/', '/review/jingle-calendar/', '/nye-homepage-concepts/']) {
  const response = await get(path);
  check(path + ' remains gated', response.status === 401 && /noindex/.test(response.headers.get('x-robots-tag')));
}
const sitemap = await readFile(new URL('../.vercel/output/static/sitemap-0.xml', import.meta.url), 'utf8');
check('public landing in sitemap exactly once', sitemap.split('<loc>https://www.twistedpin.com/jingle-bowl/</loc>').length === 2);
check('booking and concepts not in sitemap', !/\/jingle-bowl\/booking\/|\/jingle-bowl-concepts\/|\/review\/jingle-calendar\//.test(sitemap));
const calendar = await readFile(new URL('../.vercel/output/static/upcoming-events/index.html', import.meta.url), 'utf8');
check('public calendar links to Jingle', calendar.includes('href="/jingle-bowl/"') && calendar.includes('Jingle Bowl!'));
check('calendar uses approved Santa art', calendar.includes('/jingle-bowl/santa-entrance.webp'));
const home = await readFile(new URL('../.vercel/output/static/index.html', import.meta.url), 'utf8');
check('shared homepage has Jingle and NYE candidates', home.includes('data-homepage-jingle') && home.includes('data-homepage-nye'));
check('nav includes public Jingle', home.includes('href="/jingle-bowl/"'));
console.log(`PASS ${checks} actual public-build assertions; no outbound requests or API mutations.`);
