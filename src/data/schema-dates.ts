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
  /** ISO date — last day of the program window (inclusive). */
  programEnd: "2026-06-30",
} as const;

export const SUMMER_PIN_PASS = {
  /** ISO date — last day the pass is valid (inclusive). */
  validThrough: "2026-09-01",
} as const;
