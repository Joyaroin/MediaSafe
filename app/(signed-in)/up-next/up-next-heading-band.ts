/**
 * Which of the three words the Up next heading says — issue #319, spec #317.
 *
 * ── The failure this exists to make impossible ────────────────────────────────────────
 *
 * `up-next-heading.tsx` used to print the literal string *Tonight*, with no clock anywhere
 * near it. That made it right at night and wrong every other hour — the exact shape of bug
 * `upcoming-grouping.ts`'s docblock names: something that looks entirely correct (every
 * render draws a heading) while being quietly false the whole rest of the day.
 *
 * So the choice is a pure function of an hour and a zone, on `upcoming-grouping.ts`'s own
 * model: the instant and the zone are **arguments**, nothing in this file reads a clock,
 * and `tests/up-next-heading-band.test.ts` drives it directly, across a real zone whose
 * local hour disagrees with the instant's. The caller supplies the account's zone through
 * `requireTimezone()`/`TIMEZONE_FALLBACK` (`lib/session.ts`, `lib/timezone.ts`) and the one
 * instant its own render already read — never a device clock, which a server-rendered
 * heading does not have, and never a second fallback beside the one this codebase already
 * settled on.
 *
 * ── The three bands ────────────────────────────────────────────────────────────────────
 *
 * Morning until midday, afternoon until six, evening after — the boundaries the ticket
 * states in as many words. Midday itself reads as afternoon and six itself reads as
 * evening: each band owns its opening instant, the way `upcoming-grouping.ts`'s
 * `bucketFor` treats `ahead === 0` as *Today* rather than the tail of yesterday.
 */

const AFTERNOON_STARTS_AT_HOUR = 12;
const EVENING_STARTS_AT_HOUR = 18;

/**
 * `This morning`, `This afternoon` or `Tonight` — the word `up-next-heading.tsx` renders,
 * for the reader's zone at the given instant.
 *
 * `en-GB`/`formatToParts` rather than arithmetic on `at.getUTCHours()` plus an offset,
 * matching `readerDay`'s reasoning in `upcoming-grouping.ts`: the runtime's own IANA
 * database is the one honest authority on what a zone's local hour is, DST included, and
 * hand-rolling the offset would be a second one next to it.
 */
export function upNextHeadingWord(zone: string, at: Date): string {
  const hour = localHour(zone, at);

  if (hour < AFTERNOON_STARTS_AT_HOUR) return "This morning";
  if (hour < EVENING_STARTS_AT_HOUR) return "This afternoon";
  return "Tonight";
}

/**
 * The local hour, `0`–`23`. `hourCycle: "h23"` rather than the default: `Intl` left to
 * choose picks `h24` for `en-GB` in some runtimes, whose midnight prints `24` rather than
 * `0` — exactly the value `AFTERNOON_STARTS_AT_HOUR`'s comparison would misread as evening.
 */
function localHour(zone: string, at: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(at)
    .find((part) => part.type === "hour")?.value;

  return Number(hour ?? "0");
}
