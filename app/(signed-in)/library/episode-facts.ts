/**
 * An episode's own line of mirrored metadata — the date it went out and how long it runs
 * (issue #253). `title-meta-line.ts`'s sibling, one level down: that one is a title's year
 * and a film's runtime, this one is an episode's air date and an episode's runtime, and
 * neither is a special case of the other.
 *
 * Pure, and beside the surfaces rather than inside one, for the reason `title-meta-line.ts`
 * gives: a line written twice is a line that starts describing the same episode two ways.
 *
 * **Never a network, and never an air time.** TMDB publishes an air *date* for an episode
 * and no time of day at all — issue #245 says so where it refuses to draw one on Upcoming,
 * and the same fact binds here. A *time unknown* state would be the only state that half
 * of the line ever reached.
 */

/**
 * `"2026-03-01"` → `"1 March 2026"`.
 *
 * ── A deliberate sibling of `stats-figures.ts`'s `dayInWords`, not a caller of it ─────
 *
 * The two run the same three lines and answer different questions, which is the same
 * relationship `markUpToCount` records with `formatTitleCount`. `dayInWords` formats a day
 * that `db/access.ts` has **already bucketed into the reader's own zone**, and its docblock
 * turns on that: it *must not re-interpret it in another one*. This formats a plain
 * catalogue date that was never in a zone and never will be — the day TMDB says an episode
 * went out, the same day for every reader on earth.
 *
 * `timeZone: "UTC"` on both, and for the same mechanical reason rather than the same
 * semantic one: `new Date(y, m, d)` reads the *server's* zone, so a date built and
 * formatted anywhere east or west of it comes back a day out. Constructing in UTC and
 * formatting in UTC is what keeps the string equal to the column (ADR-0003's rule that the
 * clock is an input, applied to a value that has no clock in it at all).
 *
 * Importing the stats one would couple this page to a surface issue #245 removes outright.
 */
export function airDateInWords(airDate: string): string {
  const [year, month, day] = airDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    // Both halves are load-bearing and the first draft of this had only the `Date.UTC`.
    // Building the instant in UTC and then formatting it in the *server's* zone printed
    // `2026-03-01` as *28 February 2026* on a machine west of UTC — the exact slip the
    // paragraph above describes, caught by `tests/episode-facts.test.ts` rather than in
    // production. `stats-figures.ts`'s `dayInWords` carries this line for the same reason.
    timeZone: "UTC",
  });
}

/**
 * The date and the runtime, joined — or `null` when the mirror has neither, so the caller
 * renders no line at all rather than an empty one holding a real line's space.
 *
 * ── A missing half is dropped, never filled in ───────────────────────────────────────
 *
 * An episode TMDB has not dated prints its runtime alone; one with no runtime prints its
 * date alone. Neither absence gets a word — no *date unknown*, no *runtime unknown*, no
 * dash standing in. This is the Named Episode Rule's own instinct one field over: the page
 * says what the catalogue told it and stays silent about what it did not, and a reader is
 * never shown a placeholder that reads like a fact.
 *
 * It is also why this is separate from the synopsis's two states next to it on the page.
 * A missing air date is **not** worth a sentence, because the date is one clause of a
 * supporting line; a missing synopsis is, because the synopsis is the thing the reader
 * opened the page for and an unexplained blank where it should be is the empty region
 * `AGENTS.md` opens on.
 *
 * `" · "` is the separator `titleMetaLine` already uses for the same job.
 */
export function episodeMetaLine(episode: {
  readonly airDate: string | null;
  readonly runtimeMins: number | null;
}): string | null {
  const parts: string[] = [];
  if (episode.airDate !== null) parts.push(airDateInWords(episode.airDate));
  if (episode.runtimeMins !== null) parts.push(`${episode.runtimeMins} min`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
