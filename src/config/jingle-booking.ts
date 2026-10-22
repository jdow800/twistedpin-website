/** The approved protected connection is enabled when the override is absent.
 * Only the exact string 'true' enables an explicit override; false or malformed
 * values disable fresh sales. The API still owns eligibility and readiness.
 * This does not publish the page or activate a homepage/calendar campaign. */
export function jingleBookingEnabled(value: unknown): boolean {
  return value === undefined || value === 'true';
}

export function jingleBookingHref(lane: 'traditional' | 'vip'): string {
  return `/jingle-bowl/booking/?lane=${lane}`;
}
