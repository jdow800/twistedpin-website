// Brand-color allowlist for the Twisted Pin text dialect. A `<font color="…">`
// resolves ONLY to one of these names → its hex; anything else (e.g. "red",
// "#ff0000") is ignored and the text renders uncolored. Locked so authored copy
// can't blow up contrast or go off-brand. (Context/brand-guidelines.)
//
// Part of the canonical, framework-agnostic dialect core — see ./index.ts.

export const BRAND_COLORS: Record<string, string> = {
  glow: "#4eecc4",
  copper: "#d88b5c",
  fuchsia: "#d45d92",
  pink: "#d45d92",
  gold: "#ffe236",
  lemon: "#ffe236",
  orange: "#ff8000",
  tango: "#ff8000",
  blue: "#468cc8",
};

/** Resolve a brand-color name to its hex, or null when it's not on the allowlist. */
export function resolveBrandColor(name: string): string | null {
  return BRAND_COLORS[name.toLowerCase()] ?? null;
}
