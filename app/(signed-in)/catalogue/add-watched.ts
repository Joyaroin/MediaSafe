import type { TitleKind } from "@/tmdb/mirror";

/**
 * What the second add says, on the unowned title page — issue #222. Search offered it too
 * until issue #550, which replaced it there with the follow-up chips
 * (`search/where-up-to-labels.ts`).
 *
 * Pure, and with no React in it, so the one rule this feature has on the glass can be
 * read and tested as a rule (`tests/add-watched.test.ts`) rather than through a rendered
 * row. It is two functions and no component on purpose: a surface draws the control in its own
 * register at its own measure, and the only thing it may not drift on is **what it claims
 * one press will record**.
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

/**
 * What a screen reader is told the control does, naming the title in full.
 *
 * It **starts with the visible label** (WCAG 2.5.3, *label in name*), so voice control
 * saying "I've seen it all" finds the button, and Playwright's
 * `getByRole('button', { name: /^I've seen it all/ })` does too. The title follows a colon.
 * A show's name ends *every aired episode*, because *all* alone is unclear read aloud and
 * *aired* is what separates this write from one that claims an episode not yet out.
 */
export function addWatchedAccessibleLabel(kind: TitleKind, titleName: string): string {
  return kind === "film"
    ? `${addWatchedLabel(kind)}: ${titleName}`
    : `${addWatchedLabel(kind)}: ${titleName}, every aired episode`;
}
