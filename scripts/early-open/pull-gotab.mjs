// Early-open analysis — GoTab revenue pull.
//
//   node --env-file=.env scripts/early-open/pull-gotab.mjs
//
// Pulls the GoTab ledger for the 10 June test days, classifies via the
// accounting-stream taxonomy learned from the warehouse (revenue = NET_SALES
// reporting group; Tax/Tips/Processor/Fees/Receivables net to zero and are
// dropped), and reports revenue in the 9am→normal-open early window per day,
// broken out by stream so per-category COGS can be applied later.
//
// Creds come from .env (GOTAB_BI_*), mirroring the n8n BI workflow's auth.

const ACCESS_ID = process.env.GOTAB_BI_ACCESS_ID;
const ACCESS_SECRET = process.env.GOTAB_BI_ACCESS_SECRET;
const TAB_LOCATION_ID = process.env.GOTAB_BI_TAB_LOCATION_ID || '101325';
const TZ = 'America/Chicago';

// Test days + the normal open time on each (early window = 9am → open).
// Mon–Thu open 3pm (900 min), Fri open 2pm (840 min). Window start 9am (540).
const WINDOW_START_MIN = 9 * 60;
const DAYS = [
  { day: '2026-06-01', endMin: 15 * 60 }, // Mon
  { day: '2026-06-02', endMin: 15 * 60 }, // Tue
  { day: '2026-06-03', endMin: 15 * 60 }, // Wed
  { day: '2026-06-04', endMin: 15 * 60 }, // Thu
  { day: '2026-06-05', endMin: 14 * 60 }, // Fri (2pm)
  { day: '2026-06-08', endMin: 15 * 60 }, // Mon
  { day: '2026-06-09', endMin: 15 * 60 }, // Tue
  { day: '2026-06-10', endMin: 15 * 60 }, // Wed
  { day: '2026-06-11', endMin: 15 * 60 }, // Thu
  { day: '2026-06-12', endMin: 14 * 60 }, // Fri (2pm)
];

const fmtTime = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Minutes-since-midnight (Chicago wall clock) for a UTC ISO timestamp. */
function chicagoMinutes(isoUtc) {
  const parts = fmtTime.format(new Date(isoUtc)).match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return null;
  return (parseInt(parts[1], 10) % 24) * 60 + parseInt(parts[2], 10);
}

async function getToken() {
  if (!ACCESS_ID || !ACCESS_SECRET) {
    throw new Error('GOTAB_BI_ACCESS_ID / GOTAB_BI_ACCESS_SECRET missing from .env');
  }
  const res = await fetch('https://gotab.io/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_access_id: ACCESS_ID, api_access_secret: ACCESS_SECRET }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token ${res.status}: ${text.slice(0, 300)}`);
  const token = JSON.parse(text).token;
  if (!token) throw new Error(`no token in response: ${text.slice(0, 200)}`);
  return token;
}

async function getLedger(token, fiscalDay) {
  const query = `{ ledgerEntries(condition: { tabLocationId: "${TAB_LOCATION_ID}", fiscalDay: "${fiscalDay}" }, first: 3000) { totalCount pageInfo { hasNextPage } nodes { transactionTime amount excludeFromGross accountingStream { name reportingGroup } } } }`;
  const res = await fetch('https://gotab.io/api/graph', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`graph ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  return json.data.ledgerEntries;
}

const usd = (cents) => '$' + (cents / 100).toFixed(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const token = await getToken();
  console.log('GoTab token acquired. Pulling 10 test days…\n');

  const grand = { fullNet: 0, winNet: 0, winGross: 0 };
  const winStreamTotals = {};
  const rows = [];

  for (const { day, endMin } of DAYS) {
    await sleep(400); // stay under GoTab's 4 rps ceiling
    const ledger = await getLedger(token, day);
    if (ledger.pageInfo?.hasNextPage) {
      console.warn(`  ⚠ ${day}: hasNextPage=true — first:3000 didn't cover the day, add pagination`);
    }
    const nodes = ledger.nodes || [];

    let fullNet = 0, winNet = 0, winGross = 0;
    const winByStream = {};

    for (const n of nodes) {
      const grp = n.accountingStream?.reportingGroup;
      if (grp !== 'NET_SALES') continue;          // revenue only
      const cents = n.amount || 0;
      fullNet += cents;

      const mins = chicagoMinutes(n.transactionTime);
      if (mins === null || mins < WINDOW_START_MIN || mins >= endMin) continue;
      winNet += cents;
      if (!n.excludeFromGross) winGross += cents;  // gross = positive sales lines
      const s = n.accountingStream?.name || '(unknown)';
      winByStream[s] = (winByStream[s] || 0) + cents;
      winStreamTotals[s] = (winStreamTotals[s] || 0) + cents;
    }

    grand.fullNet += fullNet;
    grand.winNet += winNet;
    grand.winGross += winGross;
    rows.push({ day, endMin, totalRows: ledger.totalCount, fullNet, winNet, winGross, winByStream });

    const endLbl = `${Math.floor(endMin / 60)}:00`;
    console.log(`${day}  (9:00–${endLbl})  early-window net ${usd(winNet)}  | full-day net ${usd(fullNet)}  | ${ledger.totalCount} ledger rows`);
    const streamLine = Object.entries(winByStream)
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `${s} ${usd(c)}`)
      .join(' · ');
    if (streamLine) console.log(`           early streams: ${streamLine}`);
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`EARLY WINDOW (9am→open), 10 days:  net ${usd(grand.winNet)}  (gross ${usd(grand.winGross)})`);
  console.log(`FULL DAY, 10 days:                 net ${usd(grand.fullNet)}`);
  console.log('\nEarly-window revenue by stream (for COGS):');
  for (const [s, c] of Object.entries(winStreamTotals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(18)} ${usd(c)}`);
  }

  // Machine-readable dump for the combine step.
  console.log('\n__JSON__' + JSON.stringify({ rows, grand, winStreamTotals }));
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
