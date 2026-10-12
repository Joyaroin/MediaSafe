/**
 * The Episode Line, as the class strings that draw it — written once for
 * the reason `programme-note-section.ts` and `errors/recovery-buttons.ts` give for their
 * own: a treatment copied is a treatment that becomes two treatments the first time one
 * of them is adjusted.
 *
 * Issue #148 is what made that a real risk rather than a tidiness argument. There are two
 * episode lists now — the owned one, whose every row is a control, and the unowned one,
 * whose rows are text — and `programme-note-episodes.tsx`'s docblock explains at length
 * why they are two components rather than one with the controls made optional. What that
 * argument justifies is two *components*, not two copies of the row's measurements.
 *
 * And these are measurements. `programme-note-episodes.tsx` records `getBoundingClientRect`
 * runs at three pane widths, over every state the owned row has, establishing that the row
 * does not resize when it is marked — the row's floor is that result, not a guess.
 * A second copy of them is a second row that was never measured, and it would drift from
 * the first silently, because nothing about a class string typed twice looks wrong.
 */

/**
 * The row. `programme-note-episodes.tsx` adds `relative` to this — its sweep is absolutely
 * positioned inside the row and must not take up flow space — and the unowned row, having
 * no sweep, does not.
 *
 * `56px` (Charcoal §8.6's board), up from the `44px` floor the earlier rows were measured
 * onto. The tick's `44px` target and a `16px` name with an *Up next* label under it both
 * fit inside it, so marking an episode still does not change the row's height: every state
 * sits on `min-h-14`, and none of them reaches it. The #148 and sentence-case measurements
 * that lived here were taken against the `code-line` row and no longer describe this one.
 */
export const EPISODE_ROW = "flex min-h-14 items-center gap-3 py-1.5";

/**
 * The Up next row, on top of `EPISODE_ROW` (Charcoal §8.6, §5.2): raised and rounded,
 * pulled out by its own padding so the numeral stays on the gutter, and `64px` for the
 * label under its name. It carries no hairline of its own — `border-transparent` beats the
 * list's `divide-hair`, which Tailwind writes at zero specificity.
 *
 * This is where *up next* is marked now. It used to be an accent chip on the number
 * (`LIVE_EDGE_OF_THE_RECORD`); with the accent equal to `text` that reads as nothing, so
 * the row and its label say it instead, and the meaning gains no colour.
 */
export const EPISODE_ROW_UP_NEXT =
  "-mx-3 my-1.5 min-h-16 rounded-[var(--radius-5)] border-transparent bg-raised plate-line px-3";

/** The number, as a serif numeral (Charcoal §5.3's Numeral, `22px`), dim. */
export const EPISODE_NUMBER = "bill-title w-6 shrink-0 text-bill-md leading-none text-dim";

/** The same numeral in `text` — the one episode that is up next. */
export const EPISODE_NUMBER_UP_NEXT = "bill-title w-6 shrink-0 text-bill-md leading-none text-text";

/** The name's cell, `16/500` (Control). `min-w-0` and the clamp inside it keep a long name
 *  from pushing the trailing slot off the row. */
export const EPISODE_NAME_CELL = "min-w-0 flex-1 text-bill-xs font-medium";

/** One season's rows. A hairline under each but the last (Tailwind 4's `divide-y`). */
export const SEASON_LIST = "mt-1.5 divide-y divide-hair";
