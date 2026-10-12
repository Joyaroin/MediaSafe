/**
 * An unaired episode's date in the row's trailing slot — *12 Nov*, or *3 Mar 2027* when it
 * is not this year (Charcoal §8.6: the date stands where the tick would be). `today` is the
 * reader's day, as a `YYYY-MM-DD` string, and only its year is read.
 *
 * **Never an air time.** TMDB publishes an air *date* for an episode and no time of day at
 * all, so a *time unknown* state would be the only state half of the line ever reached.
 *
 * ── `timeZone: "UTC"` on both halves ─────────────────────────────────────────────────
 *
 * An air date is a plain catalogue date that was never in a zone — the day TMDB says an
 * episode goes out, the same day for every reader on earth. `new Date(y, m, d)` reads the
 * *server's* zone, so a date built and formatted anywhere east or west of it comes back a
 * day out. Both halves are load-bearing: an instant built in UTC and then formatted in the
 * server's zone printed `2026-03-01` as *28 February* on a machine west of UTC, caught by
 * `tests/episode-facts.test.ts` rather than in production.
 */
export function airDateShort(airDate: string, today: string): string {
  const [year, month, day] = airDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(airDate.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
