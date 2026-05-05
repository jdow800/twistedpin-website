export const prerender = false;

import type { APIRoute } from 'astro';
import { untappdGet } from '../../../lib/untappd';

// Discovery endpoint. Returns every menu attached to UNTAPPD_LOCATION_ID
// so we can identify which one is the 28-tap self-serve wall (a venue
// can have multiple menus — Draft, Bottles, Wine, etc.). Once we know
// the right menu ID, this route can be deleted.

export const GET: APIRoute = async () => {
  try {
    const locationId = import.meta.env.UNTAPPD_LOCATION_ID;
    if (!locationId) {
      return new Response(
        JSON.stringify({ error: 'UNTAPPD_LOCATION_ID not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const data = await untappdGet(`/locations/${locationId}/menus`);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[untappd/menus]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
