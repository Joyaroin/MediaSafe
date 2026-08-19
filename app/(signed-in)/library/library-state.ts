import type { LibraryState } from "@/db/access";

/**
 * The five states, as `CONTEXT.md` names them and `DESIGN.md`'s Colour table sets them.
 *
 * Shared by the grid cell and the programme note (issue #58) because there is one thing
 * to know about a state's label — what it says and what colour it says it in — and two
 * copies of that table is how one of them drifts a word or a shade from the other. The
 * grid cell keeps its own `nextLine`, which is a property of a *tile*, not of a state:
 * the programme note has no "next line" in the same sense, it has the season/episode list
 * itself.
 *
 * *Watching* is the only one in `accent` and *Caught up* the only one at full-strength
 * `text` — the other three are metadata, so they are dim.
 */
export const STATE_LABELS: Record<LibraryState, { label: string; className: string }> = {
  watching: { label: "Watching", className: "text-accent" },
  caught_up: { label: "Caught up", className: "text-text" },
  finished: { label: "Finished", className: "text-dim" },
  watchlist: { label: "Watchlist", className: "text-dim" },
  abandoned: { label: "Abandoned", className: "text-dim" },
};
