// GoTab API client — server-side only (Client Credentials OAuth flow).
// Never import this from a .astro page frontmatter or any client-side script.

const TOKEN_URL = 'https://gotab.io/api/oauth/token';
const GRAPH_URL = 'https://gotab.io/api/graph';

const TOKEN_TIMEOUT_MS = 8_000;
const GRAPH_TIMEOUT_MS = 15_000;

// Module-level cache — survives across requests within the same serverless
// function instance. Cold starts re-fetch automatically via expiry check.
let _token: { value: string; expiresAt: number } | null = null;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

async function fetchToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 60_000) return _token.value;

  const id = import.meta.env.GOTAB_CLIENT_ID;
  const secret = import.meta.env.GOTAB_CLIENT_SECRET;

  if (!id || !secret) {
    throw new Error('GoTab credentials missing (GOTAB_CLIENT_ID / GOTAB_CLIENT_SECRET)');
  }

  // GoTab uses their own field names (api_access_id / api_access_secret)
  // rather than the standard OAuth client_id / client_secret. We send both
  // so the request works regardless of which set the server validates against.
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    api_access_id: id,
    api_access_secret: secret,
    client_id: id,
    client_secret: secret,
  });

  const { signal, cancel } = withTimeout(TOKEN_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal,
    });
  } catch (err) {
    throw new Error(`GoTab token fetch failed: ${(err as Error).message}`);
  } finally {
    cancel();
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GoTab token ${res.status}: ${text.slice(0, 500)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GoTab token: non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!json.access_token) {
    throw new Error(`GoTab token: no access_token in response: ${text.slice(0, 200)}`);
  }

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
  const { signal, cancel } = withTimeout(GRAPH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (err) {
    throw new Error(`GoTab graph fetch failed: ${(err as Error).message}`);
  } finally {
    cancel();
  }

  // 401 = token expired mid-session; clear cache and retry once
  if (res.status === 401) {
    _token = null;
    return gotabQuery<T>(query, variables);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`GoTab GraphQL ${res.status}: ${text.slice(0, 500)}`);

  const json = JSON.parse(text);
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}
