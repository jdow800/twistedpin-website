export const prerender = false;

import type { APIRoute } from 'astro';
import { gotabQuery } from '../../../lib/gotab';

// Schema discovery endpoint. Returns the root Query fields + the field
// definitions for Location, Zone, Menu, Category, and Product (if those
// types exist) so we can build accurate queries against the real schema.
// Delete this route once the menu query is finalized.

const INTROSPECTION_QUERY = `
  query Introspect {
    queryType: __type(name: "Query") {
      fields {
        name
        args { name type { name kind ofType { name kind } } }
        type { name kind ofType { name kind } }
      }
    }
    location: __type(name: "Location") {
      fields { name type { name kind ofType { name kind } } }
    }
    zone: __type(name: "Zone") {
      fields { name type { name kind ofType { name kind } } }
    }
    menu: __type(name: "Menu") {
      fields { name type { name kind ofType { name kind } } }
    }
    category: __type(name: "Category") {
      fields { name type { name kind ofType { name kind } } }
    }
    product: __type(name: "Product") {
      fields { name type { name kind ofType { name kind } } }
    }
  }
`;

export const GET: APIRoute = async () => {
  try {
    const data = await gotabQuery(INTROSPECTION_QUERY);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[gotab/schema]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
