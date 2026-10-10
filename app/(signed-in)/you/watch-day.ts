import { readerDay } from "@/app/(signed-in)/up-next/upcoming-grouping";

/**
 * The day a watch happened, as You's *Recently watched* prints it — issue #371. Pure, so
 * `tests/watch-day.test.ts` covers it without a database or a browser.
 *
 * Both days are the **reader's**: `readerDay` (Up next's own helper) turns an instant into
 * a calendar day in the reader's zone, so a watch at 23:30 in Lisbon is *Today* in Lisbon
 * even though it is already tomorrow in UTC.
 *
 * The ladder is *Today*, *Yesterday*, a short weekday for the rest of the past week, then
 * a date — with the year only once it is not this year's. A weekday further back than six
 * days would name a day the reader cannot place without counting.
 */
const NAMED_WEEKDAY_HORIZON = 6;

/** `"2026-10-10"` → days since the epoch, so two days subtract to a whole number. */
function dayNumber(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

function asUtcDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

export function watchDayInWords(watchedAt: Date, zone: string, now: Date): string {
  const day = readerDay(zone, watchedAt);
  const today = readerDay(zone, now);
  const ago = dayNumber(today) - dayNumber(day);

  if (ago <= 0) return "Today";
  if (ago === 1) return "Yesterday";

  // The calendar day is already the reader's, so it is formatted in UTC: formatting it in
  // the reader's zone again would shift it a second time.
  const date = asUtcDate(day);
  if (ago <= NAMED_WEEKDAY_HORIZON) {
    return date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  }

  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
