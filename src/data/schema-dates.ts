/**
 * Annual schema date constants.
 *
 * These dates ship in JSON-LD Event / Offer schema and are visible to Google.
 * Stale dates cause GSC errors ("Offer validThrough is in the past") or
 * silent de-listing of Event entries.
 *
 * **Annual review cadence** (see launch-checklist.md → "Recurring schema
 * maintenance"):
 *   - Free Kids Bowling — review by Apr 15 each year (program runs June)
 *   - Summer Pin Pass — review by Apr 15 each year (valid through Labor Day)
 *   - NYE event — owned by `src/content/events/<year>-12-31-new-years-eve.md`
 *     content collection, NOT this file. Add a new entry annually.
 *
 * Format: ISO 8601 date strings (YYYY-MM-DD). Time-zone offsets get appended
 * by the consuming page (e.g. `${PROGRAM_START}T11:00:00-05:00`) so all
 * date constants here stay tz-free.
 *
 * If a program is paused or skipped for a year, set the dates to the next
 * planned run — DO NOT leave a past date in the schema. If the program is
 * permanently retired, remove the page + redirect entry in vercel.json.
 */

export const FREE_KIDS_BOWLING = {
  /** ISO date — first day of the program window (inclusive). */
  programStart: "2026-06-01",
  /** ISO date — last day of the program window (inclusive). Extended
   *  from 2026-06-30 → 2026-08-14 (program ran well; ops extended it). */
  programEnd: "2026-08-14",
} as const;

export const SUMMER_PIN_PASS = {
  /** ISO date — first day the offer is purchasable. Sales open mid-April
   *  each year (first 2026 member was created Apr 18). Required by Google's
   *  Merchant-listing validator: "Missing field 'validFrom' (in offers)"
   *  (GSC, first detected 2026-07-12). */
  validFrom: "2026-04-15",
  /** ISO date — last day the pass is valid (inclusive). Corrected
   *  2026-09-01 → 2026-08-14 per Jon 2026-08-01: the 2026 pass ends
   *  August 14, same day as the Free Kids Bowling window — not Labor
   *  Day as the header comment previously assumed. */
  validThrough: "2026-08-14",
} as const;
