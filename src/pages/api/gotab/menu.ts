export const prerender = false;

import type { APIRoute } from 'astro';
import { gotabQuery } from '../../../lib/gotab';

// Returns enabled + in-schedule menus → enabled + in-schedule products,
// each with embedded category link. Frontend filters by menu name
// (Cocktails / Food) or by category.name. basePrice is in cents.
//
// Cache-Control: edge caches for 15 min, serves stale up to 60s while
// revalidating. Menu changes propagate within ~15 minutes.

const MENU_QUERY = `
  query GetMenu($locationUuid: String!) {
    location(locationUuid: $locationUuid) {
      name
      timezone
      availableMenusList {
        menuUuid
        name
        shortName
        menuHeader
        menuFooter
        availableProductsList {
          productUuid
          name
          shortName
          description
          basePrice
          productCode
          productType
          tags
          images
          category {
            categoryId
            name
          }
        }
      }
    }
  }
`;

export const GET: APIRoute = async () => {
  try {
    const data = await gotabQuery(MENU_QUERY, {
      locationUuid: import.meta.env.GOTAB_LOCATION_ID,
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
