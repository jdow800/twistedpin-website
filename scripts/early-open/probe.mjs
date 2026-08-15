// Connectivity + schema probe for the early-open analysis.
//
// Run AFTER adding credentials to .env (see keys below):
//   node --env-file=.env scripts/early-open/probe.mjs
//
// It does NOT pull the analysis yet. It only:
//   1. Authenticates to GoTab and introspects the GraphQL schema for any
//      order / check / transaction / sale / payment types (so we know how
//      to pull timestamped revenue at THIS credential's scope).
//   2. Authenticates to 7shifts and discovers company + location IDs and a
//      sample time-punch shape (so we know how to pull hourly labor).
//
// Each half runs independently — a missing credential set just skips that
// half and prints what's missing, so you can test one system at a time.
//
// Required .env keys:
//   GOTAB_CLIENT_ID, GOTAB_CLIENT_SECRET, GOTAB_LOCATION_ID
//   SEVENSHIFTS_TOKEN            (7shifts API access token, used as Bearer)
//   SEVENSHIFTS_COMPANY_ID       (optional — probe will list companies if absent)

const GOTAB_TOKEN_URL = 'https://gotab.io/api/oauth/token';
const GOTAB_GRAPH_URL = 'https://gotab.io/api/graph';
const SEVENSHIFTS_BASE = 'https://api.7shifts.com/v2';

const REVENUE_TYPE_RE = /order|check|transaction|sale|tab|payment|ticket|report|revenue/i;

function hr(label) {
  console.log('\n' + '─'.repeat(64));
  console.log(label);
  console.log('─'.repeat(64));
}

function snippet(obj, max = 1400) {
  const s = JSON.stringify(obj, null, 2);
  return s.length > max ? s.slice(0, max) + '\n… (truncated)' : s;
}

// ── GoTab ────────────────────────────────────────────────────────────────
async function gotabToken() {
  const id = process.env.GOTAB_CLIENT_ID;
  const secret = process.env.GOTAB_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOTAB_CLIENT_ID / GOTAB_CLIENT_SECRET missing');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    api_access_id: id,
    api_access_secret: secret,
    client_id: id,
    client_secret: secret,
  });
  const res = await fetch(GOTAB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const token = json.token ?? json.access_token;
  if (!token) throw new Error(`no token in response: ${text.slice(0, 200)}`);
  return token;
}

async function gotabQuery(token, query, variables) {
  const res = await fetch(GOTAB_GRAPH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`graph ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  return json.data;
}

async function probeGoTab() {
  hr('GOTAB — auth + schema discovery');
  let token;
  try {
    token = await gotabToken();
    console.log('✓ authenticated (token acquired)');
  } catch (err) {
    console.log('✗ auth failed:', err.message);
    return;
  }

  // 1. All type names — surface anything revenue-shaped.
  try {
    const data = await gotabQuery(token, `query { __schema { types { name kind } } }`);
    const revenueTypes = (data.__schema.types || [])
      .filter(t => t.name && REVENUE_TYPE_RE.test(t.name) && !t.name.startsWith('__'))
      .map(t => `${t.name} (${t.kind})`);
    console.log('\nRevenue-shaped types found in schema:');
    console.log(revenueTypes.length ? revenueTypes.map(s => '  • ' + s).join('\n') : '  (none matched — orders may live in a REST reporting API, not GraphQL)');
  } catch (err) {
    console.log('✗ type listing failed:', err.message);
  }

  // 2. Root Query fields + args — how do we enter the order graph?
  try {
    const data = await gotabQuery(token, `
      query { __type(name: "Query") { fields {
        name
        args { name }
        type { name kind ofType { name kind ofType { name } } }
      } } }`);
    const fields = (data.__type?.fields || []).map(f => {
      const args = f.args.map(a => a.name).join(', ');
      return `  • ${f.name}(${args})`;
    });
    console.log('\nRoot Query fields:');
    console.log(fields.join('\n'));
  } catch (err) {
    console.log('✗ Query introspection failed:', err.message);
  }

  // 3. Location fields — does Location expose orders/checks directly?
  try {
    const data = await gotabQuery(token, `
      query { __type(name: "Location") { fields {
        name
        args { name }
        type { name kind ofType { name kind } }
      } } }`);
    const fields = (data.__type?.fields || []).map(f => `  • ${f.name}`);
    console.log('\nLocation fields:');
    console.log(fields.join('\n'));
  } catch (err) {
    console.log('✗ Location introspection failed:', err.message);
  }
}

// ── 7shifts ──────────────────────────────────────────────────────────────
async function sevenGet(path) {
  const token = process.env.SEVENSHIFTS_TOKEN;
  const res = await fetch(`${SEVENSHIFTS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

async function probeSevenShifts() {
  hr('7SHIFTS — auth + company/location discovery');
  if (!process.env.SEVENSHIFTS_TOKEN) {
    console.log('✗ SEVENSHIFTS_TOKEN missing — skipping');
    return;
  }

  // whoami confirms the token and usually returns the company id
  const who = await sevenGet('/whoami');
  console.log(`whoami → HTTP ${who.status}`);
  if (who.ok) console.log(snippet(who.json, 800));

  // companies list (some token types expose this)
  const companies = await sevenGet('/companies');
  console.log(`\n/companies → HTTP ${companies.status}`);
  if (companies.ok) console.log(snippet(companies.json, 800));

  const companyId = process.env.SEVENSHIFTS_COMPANY_ID;
  if (!companyId) {
    console.log('\n(SEVENSHIFTS_COMPANY_ID not set — grab it from the output above, add to .env, re-run for locations + sample punch)');
    return;
  }

  const locations = await sevenGet(`/company/${companyId}/locations`);
  console.log(`\n/company/${companyId}/locations → HTTP ${locations.status}`);
  if (locations.ok) console.log(snippet(locations.json, 800));

  // Sample time punch from one test day to learn the punch + wage shape.
  const punches = await sevenGet(`/company/${companyId}/time_punches?start=2026-06-01&end=2026-06-02&limit=3`);
  console.log(`\n/company/${companyId}/time_punches (sample 2026-06-01) → HTTP ${punches.status}`);
  console.log(snippet(punches.json, 1200));
}

// ── main ─────────────────────────────────────────────────────────────────
console.log('Early-open analysis — connectivity + schema probe');
await probeGoTab().catch(e => console.log('GoTab probe crashed:', e.message));
await probeSevenShifts().catch(e => console.log('7shifts probe crashed:', e.message));
hr('Done. Paste this output back and I\'ll build the real pull against the confirmed shapes.');
