// Build-time fetch for /eat food menu display.
// Source menu: "View Only Menu" (the venue's full catalog).
// We filter to food categories only — Drinks (62068) is excluded because
// soft drinks / juice boxes / Gatorade aren't a "food menu" beat.
//
// Mirrors src/lib/gotab-cocktails.ts. When a third menu use lands, hoist
// the shared shape up to a generic getMenuItems() utility.

import { gotabQuery } from './gotab';

const SOURCE_MENU = 'View Only Menu';

// Render order: classic restaurant flow (apps → salads → mains → kids → desserts).
// Category names come from GoTab unchanged — including the trailing space on
// "Desserts " (GoTab is source of truth for naming).
const CATEGORY_RENDER_ORDER = [
  '62061', // Starters
  '62067', // Salads
  '62063', // Handhelds
  '62065', // Pizza / Flatbreads
  '62069', // Kids
  '62070', // Desserts (trailing space in GoTab)
];

// Topup pool for teaser picks when staff favorites alone don't fill the slot count
const TOPUP_CATEGORY = '62061'; // Starters

const FOOD_QUERY = `
  query GetFood($locationUuid: String!) {
    location(locationUuid: $locationUuid) {
      availableMenusList {
        name
        availableProductsList {
          productUuid
          name
          description
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

export interface FoodItem {
  uuid: string;
  name: string;
  description: string;
  imageUrl: string | null;
  imageUrlLg: string | null;
  isStaffFavorite: boolean;
  categoryId: string;
  categoryName: string;
}

export interface FoodMenu {
  categories: { id: string; name: string; items: FoodItem[] }[];
  /** Up to 5 picks for the editorial teaser: staff favorites first, then
   *  topped up from Starters. */
  teaserPicks: FoodItem[];
}

const EMPTY: FoodMenu = { categories: [], teaserPicks: [] };

function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getFood(): Promise<FoodMenu> {
  let data: any;
  try {
    data = await gotabQuery(FOOD_QUERY, {
      locationUuid: import.meta.env.GOTAB_LOCATION_ID,
    });
  } catch (err) {
    // Build fails closed: page still renders, the menu sections just don't
    // appear. Keeps the deploy from breaking on a transient GoTab outage.
    console.warn('[gotab-food] fetch failed, rendering empty:', err);
    return EMPTY;
  }

  const menus = data?.location?.availableMenusList ?? [];
  const source = menus.find((m: any) => m?.name === SOURCE_MENU);
  if (!source) {
    console.warn(`[gotab-food] menu "${SOURCE_MENU}" not found`);
    return EMPTY;
  }

  // Dedupe: View Only Menu can list the same product more than once if it
  // appears in multiple zones. UUID uniqueness wins; first occurrence kept.
  const seen = new Set<string>();
  const items: FoodItem[] = [];
  for (const p of source.availableProductsList ?? []) {
    if (!CATEGORY_RENDER_ORDER.includes(p?.category?.categoryId)) continue;
    if (seen.has(p.productUuid)) continue;
    seen.add(p.productUuid);
    items.push({
      uuid: p.productUuid,
      name: p.name,
      description: cleanDescription(p.description),
      imageUrl: p.images?.md?.url ?? null,
      imageUrlLg: p.images?.lg?.url ?? null,
      isStaffFavorite: Array.isArray(p.tags) && p.tags.includes('go:staff favorite'),
      categoryId: p.category.categoryId,
      categoryName: p.category.name,
    });
  }

  const byId = new Map<string, FoodItem[]>();
  for (const it of items) {
    if (!byId.has(it.categoryId)) byId.set(it.categoryId, []);
    byId.get(it.categoryId)!.push(it);
  }

  const categories = CATEGORY_RENDER_ORDER
    .map(id => {
      const list = byId.get(id) ?? [];
      return list.length > 0
        ? { id, name: list[0].categoryName, items: list }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const staffFavs = items.filter(it => it.isStaffFavorite);
  const topup = byId.get(TOPUP_CATEGORY) ?? [];
  const teaserPicks: FoodItem[] = [];
  const teaserSeen = new Set<string>();
  for (const it of [...staffFavs, ...topup]) {
    if (teaserSeen.has(it.uuid)) continue;
    teaserPicks.push(it);
    teaserSeen.add(it.uuid);
    if (teaserPicks.length >= 5) break;
  }

  return { categories, teaserPicks };
}
