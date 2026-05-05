// Build-time fetch for /bar cocktail display.
// Source menu: "View Only Cocktail Menu" (curated for non-ordering display).
// Categories rendered: Original Craft / Reimagined / Seasonal. Mocktails excluded.

import { gotabQuery } from './gotab';

const SOURCE_MENU = 'View Only Cocktail Menu';

// Category IDs we display, in render order. Names come from GoTab unchanged
// (the truncated "Cocktails - Reimagined & Handcrafted Fav" is intentional —
// GoTab is the source of truth for naming).
const CATEGORY_RENDER_ORDER = ['102125', '102126', '114111'];

const COCKTAILS_QUERY = `
  query GetCocktails($locationUuid: String!) {
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

export interface Cocktail {
  uuid: string;
  name: string;
  ingredients: string;
  imageUrl: string | null;
  imageUrlLg: string | null;
  isStaffFavorite: boolean;
  categoryId: string;
  categoryName: string;
}

export interface CocktailMenu {
  /** Categories in render order, only those with ≥1 cocktail. */
  categories: { id: string; name: string; cocktails: Cocktail[] }[];
  /** Up to 5 picks for the editorial teaser: staff favorites first, then
   *  topped up from Original Craft Cocktails. */
  teaserPicks: Cocktail[];
}

const EMPTY: CocktailMenu = { categories: [], teaserPicks: [] };

function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getCocktails(): Promise<CocktailMenu> {
  let data: any;
  try {
    data = await gotabQuery(COCKTAILS_QUERY, {
      locationUuid: import.meta.env.GOTAB_LOCATION_ID,
    });
  } catch (err) {
    // Build fails closed: page renders with empty menu, log shows the error.
    // Keeps the deploy from breaking if GoTab is briefly unreachable.
    console.warn('[gotab-cocktails] fetch failed, rendering empty:', err);
    return EMPTY;
  }

  const menus = data?.location?.availableMenusList ?? [];
  const source = menus.find((m: any) => m?.name === SOURCE_MENU);
  if (!source) {
    console.warn(`[gotab-cocktails] menu "${SOURCE_MENU}" not found`);
    return EMPTY;
  }

  const cocktails: Cocktail[] = (source.availableProductsList ?? [])
    .filter((p: any) => CATEGORY_RENDER_ORDER.includes(p?.category?.categoryId))
    .map((p: any) => ({
      uuid: p.productUuid,
      name: p.name,
      ingredients: cleanDescription(p.description),
      imageUrl: p.images?.md?.url ?? null,
      imageUrlLg: p.images?.lg?.url ?? null,
      isStaffFavorite: Array.isArray(p.tags) && p.tags.includes('go:staff favorite'),
      categoryId: p.category.categoryId,
      categoryName: p.category.name,
    }));

  const byId = new Map<string, Cocktail[]>();
  for (const c of cocktails) {
    if (!byId.has(c.categoryId)) byId.set(c.categoryId, []);
    byId.get(c.categoryId)!.push(c);
  }

  const categories = CATEGORY_RENDER_ORDER
    .map(id => {
      const list = byId.get(id) ?? [];
      return list.length > 0
        ? { id, name: list[0].categoryName, cocktails: list }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Teaser picks: staff favorites first, top up from Original Craft Cocktails
  const staffFavs = cocktails.filter(c => c.isStaffFavorite);
  const originals = byId.get('102125') ?? [];
  const teaserPicks: Cocktail[] = [];
  const seen = new Set<string>();
  for (const c of [...staffFavs, ...originals]) {
    if (seen.has(c.uuid)) continue;
    teaserPicks.push(c);
    seen.add(c.uuid);
    if (teaserPicks.length >= 5) break;
  }

  return { categories, teaserPicks };
}
