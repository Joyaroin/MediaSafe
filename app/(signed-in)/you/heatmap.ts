import { episodeCode } from "@/app/(signed-in)/up-next/episode-card-line";
import { readerDay } from "@/app/(signed-in)/up-next/upcoming-grouping";
import type { YearWatch } from "@/db/access";

/**
 * You's year of watching — issue #372. Every function here is pure, so the bucketing is
 * held by `tests/heatmap.test.ts` without a database or a browser, DST included.
 *
 * ── Days are the reader's ────────────────────────────────────────────────────────────
 *
 * A watch's day is `readerDay(zone, watchedAt)`, Up next's own instant-to-calendar-day
 * helper, which asks `Intl` for the date in the reader's zone. That is what makes a DST
 * change a non-event: the day the clocks move is 23 or 25 hours long, and `Intl` knows
 * which instants fall in it, where arithmetic on a fixed UTC offset would put an hour of
 * watches on the wrong side of midnight.
 *
 * Everything after that works on `"YYYY-MM-DD"` strings with UTC date arithmetic, which
 * has no DST at all.
 *
 * ── The window ───────────────────────────────────────────────────────────────────────
 *
 * Exactly twelve months ending today: the day after the same date a year ago, through
 * today. A year ago is clamped to the end of its month, so the window ending 29 February
 * starts on 1 March.
 */

export interface HeatmapWatch {
  readonly key: string;
  readonly libraryEntryId: string;
  readonly titleName: string;
  /** `"S01 · E04 · Name"`, the code alone for an unnamed episode, or `"Film"`. */
  readonly what: string;
}

export interface HeatmapDay {
  readonly day: string;
  readonly count: number;
  /** 0 for none, then 1–4 by count. */
  readonly shade: 0 | 1 | 2 | 3 | 4;
  /** What a screen reader hears for the cell: `"3 watches on 4 March"`. */
  readonly label: string;
  readonly watches: readonly HeatmapWatch[];
}

export interface Heatmap {
  readonly days: readonly HeatmapDay[];
  /** Empty cells before the first day, so each column is a Monday-to-Sunday week. */
  readonly leading: number;
  readonly total: number;
}

const DAY_MS = 86_400_000;

function parse(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number);
  return [year, month, date];
}

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayMs(day: string): number {
  const [year, month, date] = parse(day);
  return Date.UTC(year, month - 1, date);
}

/** Every day of the window, oldest first, ending on `today`. */
export function yearWindow(today: string): string[] {
  const [year, month, date] = parse(today);
  const lastOfMonthAYearAgo = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  const aYearAgo = Date.UTC(year - 1, month - 1, Math.min(date, lastOfMonthAYearAgo));

  const days: string[] = [];
  for (let ms = aYearAgo + DAY_MS; ms <= dayMs(today); ms += DAY_MS) days.push(toDay(ms));
  return days;
}

/**
 * The lower bound handed to `listWatchesSince`: comfortably before the window's first
 * midnight in any zone (a year and two days back), so nothing in the window is missed and
 * the bucketing below drops the few extra.
 */
export function yearWindowSince(now: Date): Date {
  return new Date(now.getTime() - 368 * DAY_MS);
}

export function shadeFor(count: number): HeatmapDay["shade"] {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/** `"4 March"`. No year: the window holds each date once. */
export function dayInWords(day: string): string {
  return new Date(dayMs(day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** `"1 watch"`, `"3 watches"`, `"No watches"`. */
export function watchesInWords(count: number): string {
  if (count === 0) return "No watches";
  return count === 1 ? "1 watch" : `${count.toLocaleString("en-GB")} watches`;
}

export function cellLabel(count: number, day: string): string {
  return `${watchesInWords(count)} on ${dayInWords(day)}`;
}

function whatOf(watch: YearWatch): string {
  if (watch.seasonNo === null || watch.episodeNo === null) return "Film";
  const code = episodeCode(watch.seasonNo, watch.episodeNo);
  return watch.episodeName === null ? code : `${code} · ${watch.episodeName}`;
}

export function buildHeatmap(watches: readonly YearWatch[], zone: string, today: string): Heatmap {
  const span = yearWindow(today);
  const byDay = new Map<string, HeatmapWatch[]>(span.map((day) => [day, []]));

  let total = 0;
  for (const watch of watches) {
    const held = byDay.get(readerDay(zone, watch.watchedAt));
    if (held === undefined) continue;
    held.push({
      key: watch.watchId,
      libraryEntryId: watch.libraryEntryId,
      titleName: watch.titleName,
      what: whatOf(watch),
    });
    total += 1;
  }

  const days = span.map((day) => {
    const dayWatches = byDay.get(day) ?? [];
    return {
      day,
      count: dayWatches.length,
      shade: shadeFor(dayWatches.length),
      label: cellLabel(dayWatches.length, day),
      watches: dayWatches,
    };
  });

  // `getUTCDay` is 0 for Sunday; the columns start on Monday.
  const leading = (new Date(dayMs(span[0])).getUTCDay() + 6) % 7;

  return { days, leading, total };
}
