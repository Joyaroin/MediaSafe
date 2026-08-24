/**
 * How a list of dated episodes becomes Today, Tomorrow, a named weekday and Later —
 * issue #251, and the piece of this ticket its *suggested model: Opus* note is about.
 *
 * ── The failure this module exists to make impossible ────────────────────────────────
 *
 * *Today* has to mean the **reader's** today. A grouping that is wrong by one timezone is
 * wrong forever and looks entirely correct: every row is present, every date is right,
 * and one show sits under the wrong heading for every reader east or west of whoever
 * wrote it. Nothing throws, and nobody reports it.
 *
 * So the zone and the day are **arguments**, and nothing in this file reads a clock.
 * `readerDay` turns an instant into a day in a named zone, `groupUpcoming` buckets against
 * a day it is handed, and `tests/upcoming-grouping.test.ts` drives both across a real
 * boundary in a non-UTC zone. This is the split `stats-figures.ts` and `season-grouping.ts`
 * already make — presentation vocabulary beside the read rather than inside the database —
 * and #245 asks for it here by name.
 *
 * ── Two kinds of day, and they are not the same kind ─────────────────────────────────
 *
 * An **air date** is a `date` column with no instant in it: the day TMDB says an episode
 * goes out, the same string for every reader on earth. `episode-facts.ts` argues this at
 * length and this file inherits it — nothing here re-interprets an air date in anybody's
 * zone, and the weekday it prints is read off the date in UTC for that reason.
 *
 * The **reader's today** is the opposite: an instant, made into a day by a zone, which is
 * `SPEC.md` §5's *the zone is a read-time lens*. It arrives here as a string of the same
 * shape, and comparing the two is then plain arithmetic over calendar days.
 */

/** The bucket an upcoming row falls into, with the rows in the order they arrived. */
export interface UpcomingGroup<T> {
  /**
   * What the heading reads. A **name** and never a count: `SPEC.md` §7's *no counts,
   * anywhere* is narrowed by #245 to rail heads only, and this is one.
   */
  readonly label: string;
  /** Stable across renders and across days for the same bucket, so React keys and
   *  `aria-labelledby` have something to hold that is not the visible words. */
  readonly key: string;
  readonly episodes: readonly T[];
}

/** How far ahead a day still gets its own weekday name before it becomes *Later*.
 *
 *  Six, which is *the rest of this week as a reader means it*: within six days every
 *  weekday name is unambiguous, and on the seventh *Monday* would be a week away and read
 *  as three days away. `Later` is what the handoff draws past that, and it is deliberately
 *  one bucket rather than a run of dates — a reader scanning for tonight does not need
 *  November broken into Tuesdays. */
const NAMED_WEEKDAY_HORIZON = 6;

/**
 * `2026-08-24` → the number of days since the epoch, as a plain integer.
 *
 * Built in UTC and read in UTC, so the arithmetic is over calendar days and never over
 * an elapsed duration — there is no hour in either operand, so no daylight-saving
 * transition can make two adjacent days 23 or 25 hours apart and round the subtraction
 * to the wrong integer. `episode-facts.ts`'s `airDateInWords` constructs its instant the
 * same way, for the same mechanical reason.
 */
function calendarDay(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

/**
 * `Monday` — the weekday an air date falls on.
 *
 * Formatted in UTC over an instant built in UTC. Both halves are load-bearing and the
 * first draft of `episode-facts.ts` had only the first: build the instant in UTC and
 * format it in the *server's* zone and a date comes back a day out on any machine west of
 * UTC, which here would print the wrong weekday under the right rows.
 */
function weekdayName(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

/**
 * **The reader's today** — an instant and a zone in, a `YYYY-MM-DD` day out.
 *
 * The instant is an argument rather than a `new Date()` inside, which is the property the
 * whole module is built on: a function that read the clock could not be asked what it says
 * at 23:30 in Auckland, and 23:30 in Auckland is the only interesting question here.
 *
 * `en-CA` is not used, and the parts are assembled by hand: a locale is a presentation
 * choice and this is a key, so it is built from the fields rather than from whatever
 * separator a runtime's `en-CA` happens to emit. `zone` is an IANA identifier — `lib/
 * timezone.ts` is the one place this application decides what is a zone, and `user.
 * timezone` is `NOT NULL` precisely so no caller here needs an "or else" branch.
 */
export function readerDay(zone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const field = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${field("year")}-${field("month")}-${field("day")}`;
}

/**
 * **The buckets, in the order they are read.**
 *
 * Takes rows already ordered by air date (the read's own `order by`) and the reader's
 * today, and returns the groups in date order with each group's rows in the order they
 * arrived. Nothing is re-sorted here: an ordering decided twice is an ordering that comes
 * to disagree with itself, and the read is the one that has the tie-breakers.
 *
 * ── Anything before today is dropped, and that is not a filter the read forgot ───────
 *
 * `listUpcomingEpisodes` deliberately reads **one day wider than the server's own** —
 * `air_date >= current_date - 1` — because no zone on earth is more than a day from UTC,
 * so that window is a superset of every reader's *today or later* whatever hour it is.
 * Narrowing it to the reader's actual today is this function's job, done in the reader's
 * zone, once. The alternative was a day boundary computed in SQL and a second one computed
 * here for the labels, which is two clocks and one of them eventually wrong.
 *
 * Dropping is right rather than bucketing: an episode that aired yesterday is not
 * *upcoming*, it is on the next-episodes rail, and a *Yesterday* heading on this page
 * would be the second surface in the build answering *what can I watch now*.
 *
 * ── An empty group is never emitted ──────────────────────────────────────────────────
 *
 * A day with nothing on it has no heading, which is `SPEC.md` §8's rule for a rail applied
 * to a group, and it is why the buckets are discovered from the rows rather than laid out
 * in advance. A page with no rows at all returns no groups, and the surface answers that
 * with the handoff's sentence rather than four empty headings.
 */
export function groupUpcoming<T extends { readonly airDate: string }>(
  episodes: readonly T[],
  today: string,
): readonly UpcomingGroup<T>[] {
  const now = calendarDay(today);

  const groups: UpcomingGroup<T>[] = [];
  const byKey = new Map<string, T[]>();

  for (const one of episodes) {
    const ahead = calendarDay(one.airDate) - now;
    if (ahead < 0) continue;

    const { label, key } = bucketFor(ahead, one.airDate);
    const existing = byKey.get(key);
    if (existing) {
      existing.push(one);
    } else {
      const held: T[] = [one];
      byKey.set(key, held);
      groups.push({ label, key, episodes: held });
    }
  }

  return groups;
}

/**
 * Which heading a row this many days ahead sits under.
 *
 * The key is the **bucket** and not the date, which matters for exactly one of the four:
 * *Later* holds many days and must be one group, so its key cannot carry a date. The
 * weekday's key does carry its date, because two different Mondays cannot both be inside
 * the six-day horizon but a key that was only `weekday-monday` would be one edit away from
 * merging them if it ever were.
 */
function bucketFor(ahead: number, airDate: string): { label: string; key: string } {
  if (ahead === 0) return { label: "Today", key: "today" };
  if (ahead === 1) return { label: "Tomorrow", key: "tomorrow" };
  if (ahead <= NAMED_WEEKDAY_HORIZON) {
    return { label: weekdayName(airDate), key: `weekday-${airDate}` };
  }
  return { label: "Later", key: "later" };
}
