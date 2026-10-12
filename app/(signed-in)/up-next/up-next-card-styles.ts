/**
 * The class strings every Tonight row shares — the episode rows, the pending rows and the
 * film rows under them — so the list is one material. Plain strings in a plain module, so a
 * server component can import them too.
 *
 * ── A row, at the handoff's measure — Charcoal, issue #400 ───────────────────────────
 *
 * Handoff §6: `64px` high (`68px` on a desktop), a `36` by `54` poster, the title at Row
 * size, a Meta line, the trailing control, a hairline between rows. The UI overhaul's raised
 * cards go: Tonight's emphasis is the featured episode over its artwork, and a list under
 * it in seven raised cards was seven more surfaces competing with it.
 *
 * `relative overflow-hidden` is the hold's: `watch-hold` washes the row itself and its
 * `::before` sweep must not escape it. The hairline is a `border-b` in `hair`, the rule
 * between rows, not a frame — the last row has none.
 */
export const ROW =
  "relative flex h-16 items-center gap-3 overflow-hidden border-b border-hair last:border-b-0 lg:h-[68px]";

/** The list the rows sit in. `[&>li:nth-child(n+6)]:hidden` is the caller's, for *See all*. */
export const ROW_LIST = "stagger-rise flex flex-col";

export const ROW_POSTER_WIDTH = 36;

export const ROW_POSTER = "w-9 shrink-0 [--poster-radius:var(--radius-1)]";
