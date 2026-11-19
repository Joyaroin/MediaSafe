import type { UpNextEntry } from "@/db/access";

/**
 * How many Not started shows Tonight's group holds — issue #551, the spec's "up to three".
 * A separate group: Also ready's first five and its "See all N" don't count it.
 */
export const NOT_STARTED_ON_TONIGHT = 3;

/**
 * How many the page asks `cachedNotStartedShows` for: the group's three, and one more for
 * the featured slot to take when nothing is in Continue watching. Always asked, so the read
 * has one cache key whichever case the load turns out to be.
 */
export const NOT_STARTED_READ_SIZE = NOT_STARTED_ON_TONIGHT + 1;

/**
 * Where the Not started shows go — pure, so `tests/not-started-on-tonight.test.ts` drives it
 * with no DOM.
 *
 * **The featured fallback is decided on load.** `nothingOnLoad` is whether Continue watching
 * held no episode entry when the surface mounted, and the surface keeps that answer for the
 * visit. A mark is a Server Action whose response re-renders the page with fresh props, so a
 * reader who marks the last Continue watching show away would otherwise see a Not started show
 * swapped into the featured slot at once; the spec has it appear on the next load instead.
 *
 * With it set and nothing in Continue watching *now* either, the first Not started show is
 * featured and left out of the group, so a show never appears twice. Once the reader marks
 * its starting episode (#603) the next render has it in
 * Continue watching, and the ordinary rule features it.
 */
export function placeNotStarted(
  continueWatching: readonly UpNextEntry[],
  notStarted: readonly UpNextEntry[],
  nothingOnLoad: boolean,
): { readonly featured: UpNextEntry | null; readonly group: readonly UpNextEntry[] } {
  if (nothingOnLoad && continueWatching.length === 0 && notStarted.length > 0) {
    return {
      featured: notStarted[0],
      group: notStarted.slice(1, 1 + NOT_STARTED_ON_TONIGHT),
    };
  }
  return { featured: null, group: notStarted.slice(0, NOT_STARTED_ON_TONIGHT) };
}
