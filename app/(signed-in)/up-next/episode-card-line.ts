import { seasonHeading } from "@/app/(signed-in)/library/season-grouping";

/**
 * The two strings an episode card prints beside its still — issue #250, narrowed by #321,
 * and no React in either of them.
 *
 * They are here rather than inside the card for `up-next-mark.ts`'s reason, held one file
 * further out: `vitest.config.mts` runs in `node` with no DOM, and a rule that only exists
 * inside a component is a rule nothing can assert. Every one of these is a pure function
 * of facts the read already carries, and `tests/up-next-episode-card-line.test.ts` drives
 * both directly.
 *
 * **The air date and the runtime are gone — issue #321.** #250's card carried four facts:
 * this pair, the remaining count, and a last line joining an air date and a runtime. The
 * date and the runtime are noise on a surface reached to decide what to watch next; the
 * remaining count is not, and is untouched (`remainingInWords` below, and its own docblock
 * says why).
 */

/**
 * `S02 · E05` — the prototype's own code line,
 * zero-padded to two digits so a run of
 * cards does not ripple sideways as a show crosses episode nine.
 *
 * **Season 0 is `Specials`, not `S00`.** `season-grouping.ts`'s `seasonHeading` is the one
 * place this codebase answers *what is season zero called*, and it is asked here rather
 * than a third spelling being minted beside its heading and its spoken name. A card that
 * said `S00` would be the only surface in the build that does.
 *
 * The padding is deliberately not applied to `Specials`: it is a word, and it reads as one
 * where a padded number would not. `padStart` widens rather than truncates, so a
 * three-digit episode keeps all three digits.
 */
export function episodeCode(seasonNo: number, episodeNo: number): string {
  const episode = `E${pad(episodeNo)}`;
  return seasonNo === 0
    ? `${seasonHeading(seasonNo)} · ${episode}`
    : `S${pad(seasonNo)} · ${episode}`;
}

function pad(number: number): string {
  return String(number).padStart(2, "0");
}

/**
 * `+8 remaining` — how many further episodes of the show are already announced beyond the
 * one a Coming up row is offering, or `null` when there are none (#250, narrowed by the UI
 * overhaul).
 *
 * The number is not derived here, and no `UpNextEntry` carries one (#602): it is Coming up's
 * `more` (`nextPerTitle` in `upcoming-grouping.ts`), the count of the other rows
 * `listUpcomingEpisodes` returned for the same library entry. That read keeps episodes dated
 * yesterday or later (`air_date >= current_date - 1`), so these are mostly unaired ones the
 * schedule already names. It is not *Remaining* in `CONTEXT.md`, and not
 * `library_entry_remaining`, which counts every unwatched episode, unaired ones too.
 *
 * **Zero is withheld.** `more` is `0` when the offered episode is the only one dated, and the
 * row already names it; a `+0` beside it would be noise on most rows.
 */
export function remainingInWords(remainingAfter: number): string | null {
  return remainingAfter > 0 ? `+${remainingAfter} remaining` : null;
}

/**
 * `1 of 10 this season` — how far through its season the episode on a Tonight row is, in the
 * unit the featured slot prints (`tonight-featured.tsx`, `seasonProgress`). `watched` is what
 * is watched *before* the episode on show, so the first episode of a new season reads
 * `0 of 8 this season` and a season's last one reads `9 of 10 this season`.
 *
 * Tonight's rows only: Coming up's rows keep `remainingInWords`.
 */
export function seasonCountInWords(progress: {
  readonly watched: number;
  readonly released: number;
}): string {
  return `${progress.watched} of ${progress.released} this season`;
}

/**
 * `Start with S01 · E01 · Pilot` — the line on a Not started row (issue #551): where a show the
 * reader has not begun starts. No season count: a row with nothing watched has no progress to
 * report, and the line says what to do, not how far along it is. A first episode TMDB has no
 * name for reads `Start with S01 · E01`.
 */
export function startWithInWords(
  seasonNo: number,
  episodeNo: number,
  episodeName: string | null,
): string {
  const code = episodeCode(seasonNo, episodeNo);
  return episodeName === null ? `Start with ${code}` : `Start with ${code} · ${episodeName}`;
}
