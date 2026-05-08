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

// Topup pool for teaser picks when pinned/staff favorites don't fill the slot count
const TOPUP_CATEGORY = '62061'; // Starters

// Editorial pins for the /eat teaser. Marketing pick is decoupled from the
// kitchen's staff-favorite tags in GoTab — these are the items the brand
// wants featured on /eat regardless of whether they're tagged staff-favorite.
// Match is case-insensitive substring on item name. Order here = display order.
// If a pin doesn't match any item we log a warning and fall through to
// staff-favorite + Starters topup so the teaser still renders something.
const PINNED_PICKS = [
  'Kernitas Craze Tacos',
  'Hog Wild Trio',
  'Splits Hops Trio',
];

const TEASER_CAP = 3;

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
  /** Raw GoTab tags. Includes `go:staff favorite` and any dietary tags
   *  ops adds in the GoTab dashboard. Schema mapping in /menu/food
   *  consumes this to emit `suitableForDiet` URLs. */
  tags: string[];
  categoryId: string;
  categoryName: string;
}

export interface FoodMenu {
  categories: { id: string; name: string; items: FoodItem[] }[];
  /** Up to TEASER_CAP picks for the editorial teaser. PINNED_PICKS first
   *  (marketing's editorial picks), staff favorites + Starters as fallback. */
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
      tags: Array.isArray(p.tags) ? p.tags : [],
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

  // Editorial picks: try pins first (case-insensitive substring match),
  // then fall through to staff-favorite tags + Starters topup. Cap at TEASER_CAP.
  const teaserPicks: FoodItem[] = [];
  const teaserSeen = new Set<string>();

  for (const pin of PINNED_PICKS) {
    const needle = pin.toLowerCase();
    const match = items.find(it => it.name.toLowerCase().includes(needle));
    if (match) {
      if (!teaserSeen.has(match.uuid)) {
        teaserPicks.push(match);
        teaserSeen.add(match.uuid);
      }
    } else {
      console.warn(`[gotab-food] PINNED_PICK "${pin}" did not match any item — falling through to auto-pick`);
    }
    if (teaserPicks.length >= TEASER_CAP) break;
  }

  if (teaserPicks.length < TEASER_CAP) {
    const staffFavs = items.filter(it => it.isStaffFavorite);
    const topup = byId.get(TOPUP_CATEGORY) ?? [];
    for (const it of [...staffFavs, ...topup]) {
      if (teaserSeen.has(it.uuid)) continue;
      teaserPicks.push(it);
      teaserSeen.add(it.uuid);
      if (teaserPicks.length >= TEASER_CAP) break;
    }
  }

  return { categories, teaserPicks };
}
