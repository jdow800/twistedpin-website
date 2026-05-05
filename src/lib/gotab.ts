// GoTab API client — server-side only (Client Credentials OAuth flow).
// Never import this from a .astro page frontmatter or any client-side script.

const TOKEN_URL = 'https://gotab.io/api/oauth/token';
const GRAPH_URL = 'https://gotab.io/api/graph';

// Module-level cache — survives across requests within the same serverless
// function instance. Cold starts re-fetch automatically via expiry check.
let _token: { value: string; expiresAt: number } | null = null;

async function fetchToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 60_000) return _token.value;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: import.meta.env.GOTAB_CLIENT_ID,
      client_secret: import.meta.env.GOTAB_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GoTab auth ${res.status}: ${body}`);
  }

  const json = await res.json();
  _token = {
    value: json.access_token,
    expiresAt: now + (json.expires_in ?? 86400) * 1000,
  };
  return _token.value;
}

export async function gotabQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await fetchToken();

  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  // 401 = token expired mid-session; clear cache and retry once
  if (res.status === 401) {
    _token = null;
    return gotabQuery<T>(query, variables);
  }

  if (!res.ok) throw new Error(`GoTab GraphQL ${res.status}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}
