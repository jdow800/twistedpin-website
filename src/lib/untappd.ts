// Untappd for Business API client — server-side only.
// Auth: HTTP Basic with email:api_token. No OAuth dance, no token caching
// needed (the API token IS the long-lived credential).

const BASE_URL = 'https://business.untappd.com/api/v1';
const TIMEOUT_MS = 15_000;

function authHeader(): string {
  const email = import.meta.env.UNTAPPD_EMAIL;
  const token = import.meta.env.UNTAPPD_API_KEY;
  if (!email || !token) {
    throw new Error('Untappd credentials missing (UNTAPPD_EMAIL / UNTAPPD_API_KEY)');
  }
  const encoded = Buffer.from(`${email}:${token}`).toString('base64');
  return `Basic ${encoded}`;
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

export async function untappdGet<T = unknown>(path: string): Promise<T> {
  const { signal, cancel } = withTimeout(TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
      },
      signal,
    });
  } catch (err) {
    throw new Error(`Untappd fetch failed: ${(err as Error).message}`);
  } finally {
    cancel();
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Untappd ${res.status}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Untappd: non-JSON response: ${text.slice(0, 200)}`);
  }
}
