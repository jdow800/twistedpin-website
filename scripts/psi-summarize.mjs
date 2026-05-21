import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const name = process.argv[2];
if (!name) {
  console.error('usage: node scripts/psi-summarize.mjs <basename>');
  process.exit(1);
}
const file = path.join(os.tmpdir(), `psi-${name}.json`);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const lr = data.lighthouseResult;
if (!lr) {
  console.log('NO lighthouseResult — error?');
  console.log(JSON.stringify(data.error || data, null, 2).slice(0, 1000));
  process.exit(0);
}
console.log('==== ' + name + ' ====');
console.log('PERF:', Math.round(lr.categories.performance.score * 100));
console.log('LCP:', lr.audits['largest-contentful-paint'].displayValue);
console.log('FCP:', lr.audits['first-contentful-paint'].displayValue);
console.log('CLS:', lr.audits['cumulative-layout-shift'].displayValue);
console.log('TBT:', lr.audits['total-blocking-time'].displayValue);
console.log('SI :', lr.audits['speed-index'].displayValue);
const lcp = lr.audits['largest-contentful-paint-element'];
console.log('--- LCP element ---');
if (lcp && lcp.details && lcp.details.items) {
  for (const it of lcp.details.items) {
    if (it.items) {
      for (const x of it.items) console.log(JSON.stringify(x).slice(0, 500));
    } else {
      console.log(JSON.stringify(it).slice(0, 500));
    }
  }
}
console.log('--- Opportunities (>50ms or >5KiB) ---');
for (const a of Object.values(lr.audits)) {
  if (a.details && a.details.type === 'opportunity' && (a.numericValue || 0) > 50) {
    console.log(a.id, '|', a.displayValue || '', '|', a.title);
  }
}
console.log('--- Diagnostics ---');
for (const id of ['render-blocking-resources','unused-javascript','unminified-javascript','uses-text-compression','uses-rel-preload','total-byte-weight','main-thread-tasks','bootup-time','third-party-summary','network-rtt','network-server-latency','dom-size','mainthread-work-breakdown','uses-long-cache-ttl','duplicated-javascript','legacy-javascript','prioritize-lcp-image','lcp-lazy-loaded']) {
  const a = lr.audits[id];
  if (a && a.displayValue) console.log(id, '|', a.displayValue, '|', (a.title || '').slice(0,60));
}
