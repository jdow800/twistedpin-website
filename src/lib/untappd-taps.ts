// Build-time fetch for /bar #tap-list display.
// Hits Untappd Business: location → menus → sections → items.
// Falls back to an empty list if any step fails — page renders, the
// tap-list section just doesn't show.

import { untappdGet } from './untappd';

export interface Tap {
  tapNumber: string; // "1", "2" — numeric string from Untappd
  type: 'beer' | 'wine' | string;
  name: string;
  brewery: string; // brewery for beer; producer for wine
  breweryLocation: string; // "Plainfield, IL" — empty string if not set
  style: string; // best-available style label
  abv: string; // "4.0" — Untappd returns string, we keep the format
  labelImage: string | null;
}

export interface TapSection {
  id: number;
  name: string; // "Draft Beer", "NA Draft", "Wine on Tap"
  taps: Tap[];
}

export interface TapList {
  sections: TapSection[];
  totalCount: number;
}

const EMPTY: TapList = { sections: [], totalCount: 0 };

function pickLabelImage(item: any): string | null {
  // Untappd returns a generic placeholder (badge-beer-default.png for beer,
  // default/wine.svg for wine) when an item has no real label image.
  // Reject those so we don't render visual noise — a missing label slot
  // looks better than 28 identical placeholders.
  const url = item.label_image_thumb || item.label_image;
  if (!url) return null;
  if (url.includes('badge-beer-default')) return null;
  if (url.includes('default/wine.svg')) return null;
  return url;
}

function pickStyle(item: any): string {
  // Untappd has 3 style fields with different fidelity: short_style is the
  // cleanest (e.g. "IPA - American" vs original "IPA - Imperial / Double
  // New England / Hazy"). Wines have neither — use category.
  return item.short_style || item.style || item.category || '';
}

function pickBrewery(item: any): string {
  // Wines store the producer in `producer`, not `brewery`.
  return item.brewery || item.producer || '';
}

function pickBreweryLocation(item: any): string {
  return item.brewery_location || item.location || '';
}

export async function getTapList(): Promise<TapList> {
  const locationId = import.meta.env.UNTAPPD_LOCATION_ID;
  if (!locationId) {
    console.warn('[untappd-taps] UNTAPPD_LOCATION_ID not configured');
    return EMPTY;
  }

  let data: any;
  try {
    const menusResp: any = await untappdGet(`/locations/${locationId}/menus`);
    const menu = (menusResp.menus ?? [])[0];
    if (!menu) return EMPTY;

    const sectionsResp: any = await untappdGet(`/menus/${menu.id}/sections`);
    const rawSections = sectionsResp.sections ?? [];

    const sections = await Promise.all(
      rawSections
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map(async (section: any) => {
          const itemsResp: any = await untappdGet(`/sections/${section.id}/items`);
          const rawItems = itemsResp.items ?? itemsResp ?? [];

          const taps: Tap[] = rawItems
            .map((it: any) => ({
              tapNumber: String(it.tap_number ?? ''),
              type: it.type ?? 'beer',
              name: it.name ?? '',
              brewery: pickBrewery(it),
              breweryLocation: pickBreweryLocation(it),
              style: pickStyle(it),
              abv: String(it.abv ?? ''),
              labelImage: pickLabelImage(it),
            }))
            .sort((a: Tap, b: Tap) => {
              const aN = parseInt(a.tapNumber, 10);
              const bN = parseInt(b.tapNumber, 10);
              return (isNaN(aN) ? 999 : aN) - (isNaN(bN) ? 999 : bN);
            });

          return {
            id: section.id,
            name: section.name,
            taps,
          };
        }),
    );

    const totalCount = sections.reduce((n, s) => n + s.taps.length, 0);
    return { sections, totalCount };
  } catch (err) {
    console.warn('[untappd-taps] fetch failed, rendering empty:', err);
    return EMPTY;
  }
}
