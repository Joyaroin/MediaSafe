import type { LibraryState } from "@/db/access";

/**
 * How the Stats page turns a number into words — every one of them a pure function, and
 * every one of them here rather than inline in the surface.
 *
 * The split is the one `db/library-sort.ts` makes against `db/access.ts`: nothing in this
 * file reads a row, so all of it can be exercised without a database and without a browser
 * (`tests/stats-figures.test.ts`). What is left in the surface is layout.
 *
 * ── One rule runs through all of it ──────────────────────────────────────────────────
 *
 * **Nothing here invents a figure it was not given.** No rounding a partial total up to a
 * suspiciously round number, no *about a month* over four days of data, no *0* standing in
 * for *nothing to say*. Where the data cannot answer, the caller is handed `null` and the
 * page prints a sentence instead — which is why `averageInWords` takes `number | null` and
 * why it is a type error to forget the second case.
 */

/** An hour, in minutes — written once so the three places that divide by it agree. */
const MINUTES_PER_HOUR = 60;

/** Minutes in a day. Watch time reaches days quickly; a library of 472 titles is weeks. */
const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24;

/**
 * `1` → `"1 film"`, `3` → `"3 films"`. The one place plural `s` is decided.
 *
 * The plural form is the third argument rather than a rule, because English does not have
 * one: *watch* pluralises to *watches* and nothing this function could infer would get that
 * right without also getting something else wrong. Callers with a regular noun omit it.
 *
 * It is named `many` rather than `plural`, which is what it was first called and is the
 * obvious name for it. A parameter with the function's own name shadows the function
 * inside its own body — harmless here, because nothing recurses, and exactly the kind of
 * harmless that stops being harmless the day somebody adds a recursive branch and binds a
 * string instead.
 */
export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? noun : many}`;
}

/**
 * Minutes as the two largest units that are not zero — `"4 days, 6 hours"`, `"6 hours, 20
 * minutes"`, `"20 minutes"`.
 *
 * **Two units, never three.** A watch-time total is read for its size rather than its
 * precision, and *4 days, 6 hours and 20 minutes* asks the reader to hold a number that the
 * page has already said is incomplete. The remainder is dropped rather than rounded into
 * the unit above, so the figure printed is always one the data supports.
 *
 * Zero is `"none"` and not `"0 minutes"`. An account that has watched nothing with a runtime
 * on it has no watch time, and a zero with a unit after it reads like a measurement.
 */
export function minutesInWords(minutes: number): string {
  if (minutes <= 0) return "none";

  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;

  if (days > 0) {
    return hours > 0 ? `${plural(days, "day")}, ${plural(hours, "hour")}` : plural(days, "day");
  }
  if (hours > 0) {
    return rest > 0 ? `${plural(hours, "hour")}, ${plural(rest, "minute")}` : plural(hours, "hour");
  }
  return plural(rest, "minute");
}

/**
 * An average, to one decimal place — or the sentence that says there is no average.
 *
 * `null` is not `0`, and the distinction is the whole reason this takes a nullable: an
 * account whose watches carry no dates has not watched nothing, so *0.0 a week* would be
 * the page asserting something the data does not say. `db/access.ts` hands `null` up for
 * exactly that case and this is where it becomes words.
 *
 * One decimal rather than none, because the honest answers here are small: rounding *3.4
 * episodes a week* to *3* loses a fifth of it.
 */
export function averageInWords(average: number | null, unit: string): string {
  if (average === null) return "not enough dated watches to say";
  return `${average.toFixed(1)} a ${unit}`;
}

/** `"2026-08"` → `"August 2026"`. The month a row of the activity window names. */
export function monthInWords(month: string): string {
  const [year, index] = month.split("-");
  const named = new Date(Date.UTC(Number(year), Number(index) - 1, 1));
  return named.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `"2026-03-01"` → `"1 March 2026"` — the day a title finished, already in the reader's
 *  own zone by the time it reaches here (`db/access.ts` buckets it against `user.timezone`),
 *  so this formats a plain calendar date and must not re-interpret it in another one. */
export function dayInWords(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `1990` → `"1990s"`. */
export function decadeInWords(decade: number): string {
  return `${decade}s`;
}

/**
 * The five derived states, in the words `CONTEXT.md` gives them.
 *
 * Written out rather than derived from the column value, because `caught_up` is not a label
 * and because the glossary's *Avoid* lists exist: *continue watching*, *completed* and
 * *in progress* are all wrong here, and a mechanical un-snake-casing would produce the
 * right words only by luck. `LibraryState` keys it, so a sixth state is a type error.
 */
export const STATE_LABELS: Record<LibraryState, string> = {
  watching: "Watching",
  caught_up: "Caught up",
  finished: "Finished",
  watchlist: "Watchlist",
  abandoned: "Abandoned",
};

/**
 * The sentence a time-based section carries when some watches have no date.
 *
 * `null` when there are none, so a caller renders nothing rather than *0 watches carry no
 * date* — a disclaimer with nothing to disclaim is noise, and it teaches a reader to skip
 * the line on the day it says something.
 *
 * It says *not counted here* rather than *ignored*: the watches are real and are counted in
 * every figure on the page that is not about time. That is the distinction the sentence
 * exists to draw, and losing it would make the page look like it was throwing data away.
 */
export function undatedNote(undatedWatches: number): string | null {
  if (undatedWatches <= 0) return null;

  const counted = plural(undatedWatches, "watch", "watches");
  return undatedWatches === 1
    ? `${counted} carries no date and is not counted here.`
    : `${counted} carry no date and are not counted here.`;
}
