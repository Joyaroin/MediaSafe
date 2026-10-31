/**
 * *Outlined* — Charcoal's selected state (issue #397, handoff §5.2). A `1.5px` inset line
 * in `text` (`selected-line`, `app/globals.css`), the label in `text` at weight 600.
 * Unselected is the label in `dim` at weight 500, brightening on hover.
 *
 * One string for every selection in the app — the chips (`library/chip.tsx`), the
 * segmented controls (`app/segmented.tsx`) and the sidebar's current item — so selection
 * cannot look one way in the Library and another in Settings. Selection is never colour
 * alone: it is the line plus the weight, and every caller also sets `aria-pressed` or
 * `aria-current`.
 *
 * The line is on the element the caller marks with `SELECTED`, or on the travelling
 * marker that slides between options (`SELECTED_MARKER`), never both — two lines on one
 * option would draw `3px`.
 */
export const SELECTED = "font-semibold text-text";

export const UNSELECTED =
  "font-medium text-dim transition-colors duration-[var(--dur-fast)] hover:text-text";

/**
 * `UNSELECTED` for an option that wears `.pressable` — the same look, with no transition of
 * its own. Two `transition-*` utilities on one element fight over `transition-property`
 * and the later-emitted one wins (`app/tab-bar.tsx`'s docblock): `transition-colors` is
 * emitted after `.pressable`, so it took `transform` out of the list and the press's
 * compression snapped instead of easing. `.pressable`'s own transition already carries
 * `color` (issue #431), which is what drives the hover here (issue #433).
 */
export const UNSELECTED_PRESSABLE = "font-medium text-dim hover:text-text";

/** The line alone, for a marker that travels between options under a `layoutId`. The
 *  caller gives it its own radius, because the marker takes the shape of what it marks. */
export const SELECTED_MARKER = "pointer-events-none absolute inset-0 selected-line";
