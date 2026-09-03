/**
 * How You turns its figures into words — issue #247, and every function here is pure.
 *
 * The split is the retired Stats page's, for the reason that page's own figures module
 * gave: nothing here reads a row, so all of it is exercised without a database and without a
 * browser (`tests/you-figures.test.ts`), and what is left in the surface is layout.
 *
 * ── The duplication `plural` was, and is not any more ────────────────────────────────
 *
 * #247 copied `plural` out of the Stats page's figures module rather than importing it,
 * because You replaced Stats rather than sitting beside it, and importing from a module its
 * sibling ticket would delete would have made that deletion a rewrite of this page. The note
 * said the copy goes when Stats does. **Issue #249 is that day**, and it went the other way
 * round: the page and its module are gone, and this is now the only `plural` in the
 * application. `library/progress-remaining.ts` imports it from here — the one caller the
 * deleted module had that was not Stats itself.
 *
 * ── One rule runs through all of it ──────────────────────────────────────────────────
 *
 * **Nothing here invents a figure it was not given.** Watch time truncates rather than
 * rounding, so the number printed is always one the data supports; the qualification
 * returns `null` rather than a sentence with a zero in it; and the initials return `""`
 * rather than a `?` for a name with no letter in it, because a placeholder glyph is a
 * character the reader's account does not contain.
 */

/** An hour, in minutes. */
const MINUTES_PER_HOUR = 60;

/** A day, in minutes. */
const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24;

/**
 * A month, in minutes, over the mean Gregorian month of `365.2425 / 12` days. It was the
 * same constant `db/access.ts` averaged *episodes per month* against until issue #249
 * retired that figure with the Stats page; this is the only place the mean now lives, and
 * the arithmetic is spelled out above so it stays a stated definition rather than a
 * remembered one.
 *
 * A mean rather than a calendar month, because watch time is a duration and not a span
 * between two dates: there is no month it could be *the length of*. February would make
 * the same total read longer than March's.
 */
const MINUTES_PER_MONTH = 30.436875 * MINUTES_PER_DAY;

/**
 * `1` → `"1 film"`, `3` → `"3 films"`.
 *
 * The plural form is the third argument rather than a rule, because English does not have
 * one: *watch* pluralises to *watches*. Callers with a regular noun omit it.
 */
export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? noun : many}`;
}

/**
 * Watch time as years, months, days and hours — `"1 year, 2 months, 4 days"`.
 *
 * **A years term above the months/days/hours ramp.** Past twelve months the total invites
 * reading as a span rather than a count of months, so months past eleven roll into years.
 * The conversion below years is unchanged — `MINUTES_PER_MONTH` still divides the total,
 * and years is a term taken off the top of the resulting month count, not a re-derivation
 * from `minutes`.
 *
 * **A unit that is zero is dropped rather than printed.** *1 year, 0 months, 4 days* asks
 * the reader to read a zero to find out it says nothing.
 *
 * **The figure is capped at three parts, enforced explicitly.** The months/days/hours ramp
 * got this for free by only having three units to print; a fourth unit means the cap has
 * to say so itself. The largest three non-zero units are kept, so a total with all four
 * parts drops hours rather than years.
 *
 * **The remainder is truncated, never rounded up.** A total assembled from borrowed
 * runtimes is already a floor (`CONTEXT.md`, Watch time), and rounding *23 hours* to *1
 * day* would put the page above the data in the one direction it cannot afford.
 *
 * Below an hour the figure is minutes, so a reader who has marked one episode sees it
 * rather than a total that has rounded their evening away. Zero is `"none"` rather than
 * `"0 hours"`: an account that has watched nothing with a runtime on it has no watch time,
 * and a zero with a unit after it reads like a measurement.
 */
export function watchTimeInWords(minutes: number): string {
  if (minutes <= 0) return "none";

  const totalMonths = Math.floor(minutes / MINUTES_PER_MONTH);
  const afterMonths = minutes - totalMonths * MINUTES_PER_MONTH;
  const days = Math.floor(afterMonths / MINUTES_PER_DAY);
  const hours = Math.floor((afterMonths % MINUTES_PER_DAY) / MINUTES_PER_HOUR);

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  const parts = [
    years > 0 ? plural(years, "year") : null,
    months > 0 ? plural(months, "month") : null,
    days > 0 ? plural(days, "day") : null,
    hours > 0 ? plural(hours, "hour") : null,
  ]
    .filter((part) => part !== null)
    .slice(0, 3);

  // Nothing reached an hour, so minutes are the only honest unit left.
  if (parts.length === 0) return plural(minutes, "minute");

  return parts.join(", ");
}

/**
 * The initials the hero shows where the identity provider returned no avatar — issue
 * #247's *initials on the raised step where the identity provider returned no avatar*.
 *
 * First and last name, one character each. `Array.from` rather than `[0]` so a name
 * beginning with an astral character — an emoji, or anything outside the basic plane —
 * yields that character rather than half of its surrogate pair, which renders as `�`.
 *
 * A name with no character in it returns `""`, and the hero draws an empty step. There is
 * no `?` fallback: a glyph standing in for a name is a character this account does not
 * have, and an empty step already reads as *no picture* without asserting anything.
 */
export function initialsFrom(name: string): string {
  const words = name.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return "";

  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";

  return `${first}${last}`.toLocaleUpperCase("en-GB");
}

/**
 * The one line that qualifies the six figures — issue #247's *the qualification is part of
 * the figure, not a footnote*.
 *
 * ── Two incompletenesses, and only one of them subtracts ─────────────────────────────
 *
 * **A watch with no runtime is missing from the two watch times.** `CONTEXT.md`'s glossary
 * entry says so in as many words — watch time *is assembled from borrowed runtimes … so it
 * is a floor rather than a total, and the count of watches carrying no runtime is part of
 * the figure rather than a footnote to it*. This line is that clause, on the glass.
 *
 * **A watch with no date is missing from nothing here**, and the sentence must not imply
 * otherwise. The same glossary entry: *a watch with no date still counts: this is derived
 * from what you watched, not when.* The retired Stats page's own note said *not counted
 * here*, which is true of a streak and of an activity window and is false of every figure
 * on this page — copying it across would have been the page's one dishonest sentence. It
 * is still named, because the ticket asks for it named and because a reader who imported a
 * library with dateless watches should learn that from the page rather than wonder.
 *
 * `null` when there is nothing to name, so the page renders no line at all rather than a
 * disclaimer with nothing to disclaim.
 */
export function qualification({
  watchesWithoutRuntime,
  undatedWatches,
}: {
  readonly watchesWithoutRuntime: number;
  readonly undatedWatches: number;
}): string | null {
  const clauses: string[] = [];

  if (watchesWithoutRuntime > 0) {
    clauses.push(
      /**
       * *The watch times above*, not *both watch times*. The count is over all watches
       * and does not say which side they fell on, so naming both would be the page
       * asserting that each of the two is short — which is false whenever every missing
       * runtime happens to be a film's.
       */
      `${plural(watchesWithoutRuntime, "watch", "watches")} carried no runtime, so the watch times above are a floor rather than a total`,
    );
  }

  if (undatedWatches > 0) {
    const counted = plural(undatedWatches, "watch", "watches");
    const carries = undatedWatches === 1 ? "carries" : "carry";
    clauses.push(
      `${counted} ${carries} no date, which changes none of these figures — they are what you watched, not when`,
    );
  }

  if (clauses.length === 0) return null;

  return `${clauses.join("; ")}.`;
}
