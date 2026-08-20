/**
 * `DESIGN.md`'s Episode Line, as the four class strings that draw it — written once for
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
 * does not resize when it is marked — `min-h-11` and `w-9` are that result, not a guess.
 * A second copy of them is a second row that was never measured, and it would drift from
 * the first silently, because nothing about a class string typed twice looks wrong.
 */

/**
 * The row. `programme-note-episodes.tsx` adds `relative` to this — its sweep is absolutely
 * positioned inside the row and must not take up flow space — and the unowned row, having
 * no sweep, does not.
 */
export const EPISODE_ROW = "flex min-h-11 items-center gap-3 py-2.5";

/**
 * The `E1` label: dim, fixed-width, tabular. The owned row swaps this for an accent chip
 * on the one episode that is up next; nothing on the unowned row can, because being next
 * is a fact about a reader and that list has none.
 */
export const EPISODE_NUMBER = "code-line w-9 shrink-0 text-dim";

/** The name's cell. `min-w-0` and the `truncate` inside it are what keep a long name from
 *  wrapping and taking the row's measured height with it. */
export const EPISODE_NAME_CELL = "min-w-0 flex-1 text-item";

/** One season's rows, under its heading. */
export const SEASON_LIST = "mt-3 divide-y divide-hair";
