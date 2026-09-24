import type { LibraryEntryRow, LibraryState } from "@/db/access";
import { LibraryGrid } from "./library-grid";

/**
 * Films mode: three headed groups, and no chips.
 *
 * ── Why this screen has a different shape from the Shows screen ─────────────────────
 *
 * Because a film can only stand in three places: *"A film is only ever on
 * your watchlist, finished, or abandoned."* Two of the six chips — Watching and Caught up
 * — describe being part-way through a run of episodes, and there is no such state for a
 * film. Leaving them in Films mode would put two controls on screen that can never match a
 * row, which is a control lying about what your library can contain.
 *
 * With only three states left, filtering them one at a time is worse than showing all
 * three at once: the whole set fits on a screen. So the chips go and the groups arrive,
 * and the mode switch is a switch between two genuinely different screens rather than one
 * screen with a narrower filter. That asymmetry is deliberate and is the thing to
 * understand about this file.
 *
 * ── The order, and the words ────────────────────────────────────────────────────────
 *
 * The domain's own three words in its own order — **Watchlist, Finished,
 * Abandoned** — and identical to what the chips say in Shows mode, so one state never has
 * two names depending on which mode you are in. Not *Plan to Watch*, *Completed* or
 * *Watched*: the first two are named avoid-words, and the third cannot tell these groups
 * apart, since an abandoned film has watches too.
 *
 * Abandoned is last rather than hidden. It is the only state set by hand, so a film in it
 * is there because you said so, and a screen that cannot show it is a screen with rows of
 * your own library missing from it.
 */

/** The three states a film can be in, in the domain's order. */
const FILM_GROUPS: readonly { state: LibraryState; heading: string }[] = [
  { state: "watchlist", heading: "Watchlist" },
  { state: "finished", heading: "Finished" },
  { state: "abandoned", heading: "Dropped" },
];

export function FilmGroups({ entries }: { entries: readonly LibraryEntryRow[] }) {
  return (
    <>
      {FILM_GROUPS.map(({ state, heading }) => {
        const group = entries.filter((entry) => entry.state === state);

        /**
         * **An empty group is not drawn at all**, rather than drawn empty.
         *
         * Reserving space for controls that have nothing to act on is forbidden,
         * and three headings over nothing is that. It also matters while filtering: typing
         * a film's name should narrow the screen to the group it is in, not leave two
         * headings standing over the gaps where the others were.
         *
         * The case where *every* group is empty is not handled here — `LibrarySurface`
         * owns it, because a library with no films at all and a filter that matched no
         * film are two different sentences and neither of them is this component's.
         */
        if (group.length === 0) return null;

        const headingId = `film-group-${state}`;

        return (
          <section key={state} className="mt-6 first:mt-2">
            {/* The uppercase 11px label register declared as `label-line`,
                not a bill-title step: these name a region of one screen, and a heading
                that competes with the 34px screen title would read as four screens. */}
            <h2 id={headingId} className="label-line px-gutter text-dim">
              {heading}
            </h2>

            {/* The same grid the Shows mode draws, at the same gutter and the same column
                ladder. A film cell and a show cell are one component (`LibraryEntryCell`);
                only the arrangement above them differs between the modes, and reusing the
                grid is what keeps that true. */}
            <LibraryGrid entries={group} labelledBy={headingId} />
          </section>
        );
      })}
    </>
  );
}
