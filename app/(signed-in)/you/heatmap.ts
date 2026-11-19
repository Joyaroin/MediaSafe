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
  /** `null` for a film's watch. Kept so a day's watches can be grouped by title. */
  readonly seasonNo: number | null;
  readonly episodeNo: number | null;
  readonly watchedAt: Date;
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
      seasonNo: watch.seasonNo,
      episodeNo: watch.episodeNo,
      watchedAt: watch.watchedAt,
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

export interface DayEpisode {
  readonly key: string;
  readonly what: string;
}

/** One title's watches on one day, collapsed to a line. */
export interface DayTitleGroup {
  readonly libraryEntryId: string;
  readonly titleName: string;
  /** `"The Bear · 46 episodes · seasons 1–5"`, or `"Heat · Film"`: the row's visible text. */
  readonly line: string;
  /** The title, and the rest of `line` after it, so the row can style them apart. */
  readonly lead: string;
  readonly detail: string;
  /** Distinct episodes in season and episode order. Empty for a film. */
  readonly episodes: readonly DayEpisode[];
}

/**
 * `"season 2"`, `"seasons 1–5"`, `"seasons 1 and 3"`, `"seasons 1–3 and 5"`. Season 0 is
 * Specials, never a number: it is named after the numbered seasons.
 */
export function seasonsInWords(seasons: readonly number[]): string {
  const numbered = [...new Set(seasons.filter((season) => season > 0))].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let index = 0; index < numbered.length; ) {
    let end = index;
    while (end + 1 < numbered.length && numbered[end + 1] === numbered[end] + 1) end += 1;
    runs.push(end > index ? `${numbered[index]}–${numbered[end]}` : String(numbered[index]));
    index = end + 1;
  }

  const hasSpecials = seasons.includes(0);
  const parts = hasSpecials ? [...runs, "specials"] : runs;
  const joined =
    parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  if (numbered.length === 0) return "specials";
  return `${numbered.length > 1 ? "seasons" : "season"} ${joined}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A selected day's watches, one group per title — issue #539. Pure, held by
 * `tests/heatmap.test.ts`.
 *
 * - The count is **distinct episodes**: an episode watched twice that day is one. A film
 *   is one row however often it was watched.
 * - Titles run by their latest watch that day, newest first. One "Mark season watched"
 *   press writes every row at one instant, so ties are common: then `lower(title name)`,
 *   then the library entry id.
 * - Inside a group, episodes run by season and then episode.
 */
export function groupDayByTitle(watches: readonly HeatmapWatch[]): DayTitleGroup[] {
  interface Draft {
    libraryEntryId: string;
    titleName: string;
    latest: number;
    film: boolean;
    episodes: Map<string, { seasonNo: number; episodeNo: number; what: string }>;
  }
  const drafts = new Map<string, Draft>();

  for (const watch of watches) {
    let draft = drafts.get(watch.libraryEntryId);
    if (draft === undefined) {
      draft = {
        libraryEntryId: watch.libraryEntryId,
        titleName: watch.titleName,
        latest: 0,
        film: false,
        episodes: new Map(),
      };
      drafts.set(watch.libraryEntryId, draft);
    }
    draft.latest = Math.max(draft.latest, watch.watchedAt.getTime());
    if (watch.seasonNo === null || watch.episodeNo === null) {
      draft.film = true;
      continue;
    }
    draft.episodes.set(`${watch.seasonNo}:${watch.episodeNo}`, {
      seasonNo: watch.seasonNo,
      episodeNo: watch.episodeNo,
      what: watch.what,
    });
  }

  const ordered = [...drafts.values()].sort((a, b) => {
    if (a.latest !== b.latest) return b.latest - a.latest;
    // Code-unit order, not `localeCompare`: the rule must not move with the machine's locale.
    return (
      compare(a.titleName.toLowerCase(), b.titleName.toLowerCase()) ||
      compare(a.libraryEntryId, b.libraryEntryId)
    );
  });

  return ordered.map((draft) => {
    const episodes = [...draft.episodes.entries()]
      .sort(([, a], [, b]) => a.seasonNo - b.seasonNo || a.episodeNo - b.episodeNo)
      .map(([key, one]) => ({ key, what: one.what }));
    const seasons = [...draft.episodes.values()].map((one) => one.seasonNo);
    const detail =
      episodes.length === 0
        ? " · Film"
        : ` · ${episodes.length === 1 ? "1 episode" : `${episodes.length.toLocaleString("en-GB")} episodes`} · ${seasonsInWords(seasons)}`;
    return {
      libraryEntryId: draft.libraryEntryId,
      titleName: draft.titleName,
      lead: draft.titleName,
      detail,
      line: `${draft.titleName}${detail}`,
      episodes,
    };
  });
}
