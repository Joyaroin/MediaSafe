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
 * says why). `episodeMetaLine` and this module's own `airDateInWords` are deleted with
 * their one caller — `library/episode-facts.ts` has its own `airDateInWords`, in a longer
 * register for a different surface, and is untouched.
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
 * `+8 remaining` — how many aired episodes come **after** the one the card is offering,
 * or `null` when none do (#250, narrowed by the UI overhaul).
 *
 * The number is not derived here: it is the read's *Remaining* (`CONTEXT.md`, and
 * `upNextRead` in `db/access.ts`), minus the episode being offered and minus whatever the
 * reader has marked from this card since the page loaded.
 *
 * **Aired only.** It used to count every unwatched episode TMDB lists, so JoJo printed
 * `+8 remaining` beside an episode that had not aired — a number about the series, on a
 * surface that is about tonight. The rail that justified counting unaired episodes (Coming
 * back) is gone from Continue watching, and with it the argument.
 *
 * **Zero is withheld.** With aired-only counting, zero means *this is the last one you can
 * watch now*, and the card's own episode line already says what to watch; a `+0` beside it
 * is a line that reads as noise on most cards of a caught-up library.
 */
export function remainingInWords(remainingAfter: number): string | null {
  return remainingAfter > 0 ? `+${remainingAfter} remaining` : null;
}
