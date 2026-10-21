/** Jon's approved NYE 2026 opening schedule. Availability stays with checkout. */
export const NYE_OPENING_AT = "2026-11-18T15:00:00Z";
export const NYE_EVENT_END_AT = "2027-01-01T06:30:00Z";
export const NYE_TIME_ZONE = "America/Chicago";
export const NYE_EVENT_DATE = "2026-12-31";
export const NYE_OPENING_DATE_LABEL = "Nov 18th @ 9am";
export const NYE_OPENING_REMINDER = `Reservations open ${NYE_OPENING_DATE_LABEL}`;
export const NYE_EVENT_DATE_LABEL = "Thursday, December 31, 2026";

export const NYE_OPEN_CTA = { href: "/reserve/nye/", label: "Book NYE lanes" } as const;
export const NYE_ENDED_CTA = { href: "/reserve/", label: "Plan your next visit" } as const;
export const NYE_ENDED_HEADER_CTA = { href: "/reserve/", label: "Reserve a lane" } as const;

export type NyeOpeningPhase = "before" | "open" | "ended";

/** The landing page and booking entry share the same exact Chicago instants. */
export function nyeOpeningState(now = Date.now()) {
  const opensAt = Date.parse(NYE_OPENING_AT);
  const phase: NyeOpeningPhase = now >= Date.parse(NYE_EVENT_END_AT) ? "ended" : now >= opensAt ? "open" : "before";
  const seconds = Math.max(0, Math.ceil((opensAt - now) / 1000));
  return { phase, days: Math.floor(seconds / 86400), hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
}
