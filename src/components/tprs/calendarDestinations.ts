import { NYE_EVENT_DATE } from "../../config/nye-opening";

/** A special date is a destination, not a claim of available inventory. */
export const NYE_CALENDAR_DATES: Readonly<Record<string, string>> = {
  [NYE_EVENT_DATE]: "NYE",
};

export function specialDateLabel(
  dates: Readonly<Record<string, string>> | undefined,
  date: string,
  today: string,
): string | undefined {
  return date >= today ? dates?.[date] : undefined;
}
