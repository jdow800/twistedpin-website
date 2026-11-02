#!/usr/bin/env node
// Trailing-punctuation redirects in vercel.json (2026-11-02): a link copied or auto-linked with the
// sentence's period ("twistedpin.com/nye.") 404'd. Compiles every trailing-punct rule with
// path-to-regexp 6.1.0 (the matcher Vercel uses for `source`) and checks what each URL resolves to.
//   node scripts/test-trailing-punct-redirects.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ptr;
try { ptr = require('path-to-regexp'); } catch { ptr = require('../../Website/node_modules/path-to-regexp'); }
const { pathToRegexp } = ptr;

const cfg = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rules = cfg.redirects.filter((r) => /\{\\?[.,!)]\}\+/.test(r.source));
if (!rules.length) { console.log('FAIL no trailing-punctuation rules in vercel.json'); process.exit(1); }
// Vercel's config check runs `new RegExp(source)` on every redirect source (a bare ")" fails the deploy) and
// path-to-regexp with its options; mirror both so a bad pattern fails here instead of on Vercel.
let invalid = 0;
cfg.redirects.forEach((r, i) => {
  try { new RegExp(r.source); pathToRegexp(r.source, [], { strict: true, sensitive: true, delimiter: '/' }); }
  catch (e) { invalid++; console.log('FAIL redirect ' + i + ' source "' + r.source + '" is invalid for Vercel: ' + e.message); }
});

function resolve(path) {
  for (const r of cfg.redirects) {
    if (r.has || r.missing) continue; // host-conditioned (event.twistedpin.com); www never matches it
    const keys = [];
    const re = pathToRegexp(r.source, keys);
    const m = re.exec(path);
    if (!m) continue;
    let dest = r.destination;
    keys.forEach((k, i) => { dest = dest.replace(':' + k.name, m[i + 1] ?? ''); });
    return { dest, rule: r.source };
  }
  return null;
}

let pass = 0, fail = 0;
const t = (path, want) => {
  const got = resolve(path);
  const ok = want === null ? (got === null || !rules.some((r) => r.source === got.rule)) : got && got.dest === want;
  ok ? pass++ : fail++;
  console.log((ok ? 'pass ' : 'FAIL ') + path + ' -> ' + (got ? got.dest + '  [' + got.rule + ']' : '(no redirect)') + (ok ? '' : '   want ' + want));
};

t('/nye.', '/nye/');
t('/nye./', '/nye/');
t('/nye..', '/nye/');
t('/new-years-eve/.', '/new-years-eve/');
t('/coupon,', '/coupon/');
t('/coupon!', '/coupon/');
t('/fundraisers/)', '/fundraisers/');
t('/reserve/birthdays.', '/reserve/birthdays/');
// must NOT be touched by the trailing-punct rules
t('/nye', null);
t('/nye/', null);
t('/new-years-eve/', null);
t('/_astro/index.abc123.css', null);
t('/sitemap-index.xml', null);
t('/api/hours/', null);
t('/.', null);
t('/', null);

fail += invalid;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
