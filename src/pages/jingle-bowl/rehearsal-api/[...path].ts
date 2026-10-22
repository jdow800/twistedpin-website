import type { APIRoute } from 'astro';

export const prerender = false;
const allowed = /^(?:rehearsal\/(?:config|complete|booking\/[a-f0-9-]+(?:\/(?:confirmation|kitchen))?)|api\/(?:products(?:\/[a-f0-9-]+\/forms)?|availability(?:\/slot|\/month)?|cart(?:\/session|\/replace|\/items(?:\/[a-zA-Z0-9_-]+)?)?|checkout\/(?:quote|payment-intents|attempt-active|attempt-status|attempt-cancel|convert)))$/;

/** Local, authenticated proxy only. Its destination and route family cannot be
 * supplied by callers. The rehearsal key remains on the server. */
export const ALL: APIRoute = async ({request, params, url}) => {
  const path = (params.path ?? '').replace(/\/$/, '');
  const key = import.meta.env.JINGLE_REHEARSAL_PROXY_KEY;
  if (!import.meta.env.DEV || !key || !['127.0.0.1','localhost'].includes(url.hostname)
    || import.meta.env.PUBLIC_TPRS_API_BASE !== '/jingle-bowl/rehearsal-api') return new Response('Unavailable', {status:404});
  if (!allowed.test(path) || !['GET','POST','DELETE'].includes(request.method)) return new Response('Unsupported rehearsal request', {status:405});
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return new Response('Invalid origin', {status:403});
  if (Number(request.headers.get('content-length') ?? 0) > 100_000) return new Response('Request too large', {status:413});
  const headers = new Headers({'x-jingle-rehearsal-key':key, 'accept':'application/json'});
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const body = request.method === 'GET' ? undefined : await request.text();
  if (body && body.length > 100_000) return new Response('Request too large', {status:413});
  if (body) headers.set('content-type', 'application/json');
  try {
    const upstream = await fetch(`http://127.0.0.1:55684/${path}${url.search}`, {
      method:request.method, headers, body:body || undefined, redirect:'error', signal:AbortSignal.timeout(20_000),
    });
    const outgoing = new Headers({'content-type':upstream.headers.get('content-type') ?? 'application/json','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'});
    for (const value of upstream.headers.getSetCookie()) outgoing.append('set-cookie', value);
    return new Response(upstream.body, {status:upstream.status, headers:outgoing});
  } catch { return new Response(JSON.stringify({error:'The isolated booking service is unavailable.'}), {status:503, headers:{'content-type':'application/json','cache-control':'no-store'}}); }
};
