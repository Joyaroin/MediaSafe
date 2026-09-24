import type { TitleKind } from "@/tmdb/mirror";

/**
 * What the second add says, on both of the two surfaces that offer it — issue #222.
 *
 * Pure, and with no React in it, so the one rule this feature has on the glass can be
 * read and tested as a rule (`tests/add-watched.test.ts`) rather than through a rendered
 * row. It is two functions and no component on purpose: the search result and the unowned
 * title page draw the control in different registers at different measures, and the only
 * thing they may never disagree about is **what it claims one press will record**.
 *
 * ── Why a film and a show do not read the same ───────────────────────────────────────
 *
 * *I've seen it* on a film is unambiguous, because a film is one watch. On a show it could
 * read as *I've seen some of it*, so a show says **I've seen it all**, which is a promise
 * the write keeps exactly — every released episode above season zero, and
 * `db/access.ts`'s `addTitleToLibraryWatched` is where that is defined. Both sit beside a
 * plain *Add*, so the reader chooses between *add it* and *add it, already watched* in
 * their own words rather than the app's.
 *
 * ── The accessible name is the whole sentence ────────────────────────────────────────
 *
 * A screen reader has no row and no page heading to lean on — it has a list of buttons
 * all called *Add* something — so the accessible name carries the title, exactly as the
 * plain add's already does (`catalogue-result.tsx`). It also spells out what the show's
 * version leaves to the word *all*, because a label is read once by a sighted reader in
 * the context of a poster and a year, and read alone by everybody else.
 */

/** The visible label. */
export function addWatchedLabel(kind: TitleKind): string {
  return kind === "film" ? "I've seen it" : "I've seen it all";
}

/** What a screen reader is told the control does, naming the title in full. */
export function addWatchedAccessibleLabel(kind: TitleKind, titleName: string): string {
  return kind === "film"
    ? `Add ${titleName} to your library as watched`
    : `Add ${titleName} to your library, recording every released episode as watched`;
}
