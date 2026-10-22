import { NYE_EVENT_DATE } from "../../config/nye-opening";

/** A special date is a destination, not a claim of available inventory. */
export const NYE_CALENDAR_DATES: Readonly<Record<string, string>> = {
  [NYE_EVENT_DATE]: "NYE",
};

/** Event expiry follows the venue's day, regardless of the guest's timezone. */
export function bookingVenueDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function specialDateLabel(
  dates: Readonly<Record<string, string>> | undefined,
  date: string,
  today: string,
): string | undefined {
  // Preserve the existing NYE calendar behavior. Newly registered event dates
  // use venue time; ordinary availability and its browser-local today stay as-is.
  const destinationToday = date === NYE_EVENT_DATE ? today : bookingVenueDate();
  return date >= destinationToday ? dates?.[date] : undefined;
}
