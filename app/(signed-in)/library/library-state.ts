import type { LibraryState } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";

/**
 * The five states, as the domain names them — shared by the grid cell and the title page
 * (issue #58) because there is one thing to know about a state's label, what it says, and
 * two copies of that table is how one of them drifts a word from the other.
 *
 * **The word depends on the kind** (issue #555, spec #535): a show with no watches is
 * *Not started* and a caught-up show is *Waiting for new episodes*; a film with no watch is
 * *To watch* and a watched one is *Watched*. The database values (`watchlist`, `caught_up`,
 * `finished`, …) do not change — `db/views.ts` still derives the same five.
 *
 * Words only. The colour a label is drawn in is the surface's: the title page sets it on its
 * hero's state tag, and the grid cell carries no colour of its own for it.
 */
const SHOW_LABELS: Record<LibraryState, string> = {
  watching: "Watching",
  watchlist: "Not started",
  caught_up: "Waiting for new episodes",
  finished: "Finished",
  abandoned: "Dropped",
};

/**
 * A film is never partly watched, so `watching` and `caught_up` do not arise for one
 * (`db/views.ts`); they keep the show's words rather than throwing on a state the view
 * does not produce.
 */
const FILM_LABELS: Record<LibraryState, string> = {
  ...SHOW_LABELS,
  watchlist: "To watch",
  finished: "Watched",
};

export function stateLabel(kind: TitleKind, state: LibraryState): string {
  return (kind === "film" ? FILM_LABELS : SHOW_LABELS)[state];
}
