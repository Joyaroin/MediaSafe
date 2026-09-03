import { LIVE_EDGE_OF_THE_RECORD } from "@/app/accent-meaning";
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
 * *Watching* is the only one in `accent` and *Caught up* the only one at full strength —
 * the other three are metadata, so they are dim. Issue #310 names *why* Watching may take
 * the accent at all: `app/accent-meaning.ts`'s `LIVE_EDGE_OF_THE_RECORD`, because this is
 * the record's current position and not a fresh write — the same reasoning `SPEC.md` §3
 * reserves a *different* accent constant, `RECORDS_A_WATCH`, for.
 *
 * *Caught up* moves from `text-text` to `text-ink` in the linen redesign. It is the same
 * decision it always was — *this one is at full strength* — resolved against a palette
 * where `--text` is a mid-tone body colour rather than the near-black it used to be, so
 * full strength is now `--ink`. The label sits on `--raised` inside a card, where `--text`
 * would have been indistinguishable from the dim three beside it.
 */
export const STATE_LABELS: Record<LibraryState, { label: string; className: string }> = {
  watching: { label: "Watching", className: LIVE_EDGE_OF_THE_RECORD.ink },
  caught_up: { label: "Caught up", className: "text-ink" },
  finished: { label: "Finished", className: "text-dim" },
  watchlist: { label: "Watchlist", className: "text-dim" },
  abandoned: { label: "Abandoned", className: "text-dim" },
};
