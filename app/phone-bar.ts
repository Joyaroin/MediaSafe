/**
 * The phone's bottom bar, as a class string — the shape both `tab-bar.tsx` and the
 * Library's `selection-action-bar.tsx` draw, because the second one *replaces* the first
 * and a bar that swapped in at a different height would move every page under it.
 *
 * Written once for the reason `errors/recovery-buttons.ts` gives for the recovery buttons:
 * *"a class string copied three times is a treatment that drifts into three treatments the
 * first time one of them is adjusted."* Here the drift would be worse than cosmetic.
 * `--tab-bar-height` (`app/globals.css`) is declared as `44 + 8 + 22 + 1 = 75px`, and
 * `(signed-in)/layout.tsx` clears exactly that much at the foot of every phone page — so
 * those four numbers living in two copied strings would make the layout's clearance a
 * claim about markup nothing checks. `tab-bar.tsx`'s own docblock records what happened
 * the last time a height was kept in two places: both copies had drifted five pixels
 * before anyone noticed.
 *
 * What is **not** in here is the inside of the bar. The tab bar is a four-column grid of
 * equal cells; the action bar is a row of a count and two buttons. That is the one thing
 * that genuinely differs between the two, so it stays at each call site — the same split
 * `field-well` makes when it leaves height out.
 *
 * `44px` of content is the `h-11` each bar puts on its own children, not a height set
 * here: the tab bar's cells and the action bar's buttons both carry it, and a bar that
 * fixed its own height would let a child grow past it silently.
 */
export const PHONE_BAR =
  "fixed inset-x-0 bottom-0 z-30 border-t border-hair frosted pt-2 pb-[22px] lg:hidden";
