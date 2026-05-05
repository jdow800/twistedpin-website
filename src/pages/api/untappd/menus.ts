export const prerender = false;

import type { APIRoute } from 'astro';
import { untappdGet } from '../../../lib/untappd';

// Discovery probe: returns every menu attached to UNTAPPD_LOCATION_ID,
// each enriched with its sections and items. Used to identify the tap
// wall menu structure and design the final display. Will be deleted
// once the real /api/untappd/taps integration ships.

export const GET: APIRoute = async () => {
  try {
    const locationId = import.meta.env.UNTAPPD_LOCATION_ID;
    if (!locationId) {
      return new Response(
        JSON.stringify({ error: 'UNTAPPD_LOCATION_ID not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const menusResp: any = await untappdGet(`/locations/${locationId}/menus`);
    const menus = menusResp.menus ?? [];

    const enriched = await Promise.all(menus.map(async (menu: any) => {
      let sections: any[] = [];
      try {
        const sectionsResp: any = await untappdGet(`/menus/${menu.id}/sections`);
        sections = sectionsResp.sections ?? [];

        sections = await Promise.all(sections.map(async (section: any) => {
          try {
            const itemsResp: any = await untappdGet(`/sections/${section.id}/items`);
            return {
              ...section,
              items: itemsResp.items ?? itemsResp,
            };
          } catch (err) {
            return { ...section, _items_error: String(err) };
          }
        }));
      } catch (err) {
        return { ...menu, _sections_error: String(err) };
      }
      return { ...menu, sections };
    }));

    return new Response(JSON.stringify({ menus: enriched }, null, 2), {
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
