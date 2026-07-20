/**
 * Playbook persistence — thin PostgREST wrapper.
 *
 * Deliberately plain `fetch` against Supabase's REST API rather than
 * @supabase/supabase-js. This repo keeps its dependency list short (page-speed
 * targets are non-negotiable per CLAUDE.md) and everything we need here is
 * two verbs against two tables.
 *
 * Uses the SERVICE ROLE key: both tables are RLS-deny-all with grants only to
 * service_role, so nothing holding a browser-side key can read or write them.
 * That key must never be exposed to the client — never rename these vars to
 * PUBLIC_*, which Astro would happily ship to the browser.
 */

export interface StoreConfig {
  url: string;
  key: string;
}

/** Returns null when Supabase isn't configured, so callers can fail loudly
 *  rather than silently pretending a signature was recorded. */
export function storeConfig(): StoreConfig | null {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function headers(cfg: StoreConfig, prefer: string): HeadersInit {
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

/** Insert a row and return the created record (Prefer: return=representation). */
export async function insertReturning<T>(
  cfg: StoreConfig,
  table: string,
  row: Record<string, unknown>,
): Promise<T | null> {
  const res = await fetch(`${cfg.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(cfg, 'return=representation'),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`[playbook-store] insert ${table} failed`, res.status, await res.text());
    return null;
  }
  const rows = (await res.json()) as T[];
  return rows?.[0] ?? null;
}

/** Insert without reading anything back. */
export async function insert(
  cfg: StoreConfig,
  table: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${cfg.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(cfg, 'return=minimal'),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`[playbook-store] insert ${table} failed`, res.status, await res.text());
    return false;
  }
  return true;
}

/** Raw PostgREST GET. `query` is the part after `?`, e.g.
 *  "select=*&order=started_at.desc&limit=200". */
export async function selectRows<T>(
  cfg: StoreConfig,
  table: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    console.error(`[playbook-store] select ${table} failed`, res.status, await res.text());
    return [];
  }
  return (await res.json()) as T[];
}

/** PATCH rows matching `?<column>=eq.<value>`. */
export async function updateWhere(
  cfg: StoreConfig,
  table: string,
  column: string,
  value: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const url = `${cfg.url}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(cfg, 'return=minimal'),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.error(`[playbook-store] update ${table} failed`, res.status, await res.text());
    return false;
  }
  return true;
}
