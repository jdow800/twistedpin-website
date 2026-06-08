// Tiny media-query hook for the booking islands. Used to switch the date-strip
// chip count (and any other JS-driven responsive behavior) between mobile and
// desktop without a resize-spam listener. SSR-safe defaults to false (these are
// client:only islands, so it resolves on mount).

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** The flow's desktop breakpoint (matches the marketing site's 1025px swap). */
export const DESKTOP_QUERY = "(min-width: 1025px)";
