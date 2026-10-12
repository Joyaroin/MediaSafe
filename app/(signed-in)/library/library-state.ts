import type { LibraryState } from "@/db/access";

/**
 * The five states, as the domain names them — shared by the grid cell and the title page
 * (issue #58) because there is one thing to know about a state's label, what it says, and
 * two copies of that table is how one of them drifts a word from the other.
 *
 * Words only. The colour a label is drawn in is the surface's: the title page sets it on its
 * hero's state tag, and the grid cell no longer prints a state word at all. Until Charcoal's
 * sweep (#409) each entry also carried a `className` — Watching in the accent under
 * `LIVE_EDGE_OF_THE_RECORD` — that no surface had rendered since #324; with the accent equal
 * to `text` that meaning no longer read as a colour, and the field and the meaning both went.
 */
export const STATE_LABELS: Record<LibraryState, { label: string }> = {
  watching: { label: "Watching" },
  caught_up: { label: "Caught up" },
  finished: { label: "Finished" },
  watchlist: { label: "Watchlist" },
  abandoned: { label: "Dropped" },
};
