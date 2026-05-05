export const prerender = false;

import type { APIRoute } from 'astro';
import { gotabQuery } from '../../../lib/gotab';

// Fetches the full menu tree for the location. Returns raw GoTab data so
// the frontend can filter by menu/category name without a separate endpoint.
// Cache-Control: edge caches for 15 min, serves stale up to 60s while revalidating.

const MENUS_QUERY = `
  query GetMenus($locationId: ID!) {
    location(id: $locationId) {
      menus {
        id
        name
        categories {
          id
          name
          products {
            id
            name
            description
            price
            productCode
            variants {
              id
              name
              price
            }
          }
        }
      }
    }
  }
`;

export const GET: APIRoute = async () => {
  try {
    const data = await gotabQuery(MENUS_QUERY, {
      locationId: import.meta.env.GOTAB_LOCATION_ID,
    });

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=900, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[gotab/menu]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
