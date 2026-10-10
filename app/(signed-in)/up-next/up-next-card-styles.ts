/**
 * The class strings every Up next card shares — the episode cards on Continue watching
 * and the film cards under them — so the two lists are one material. Plain strings in a
 * plain module, so a server component can import them too.
 *
 * ── The card ─────────────────────────────────────────────────────────────────────────
 *
 * Coming up's row (`upcoming-row.tsx`) was already a raised card; Continue watching was a
 * hairline-divided list of `104px` posters, about three and a half shows to a phone
 * screen. The card is Coming up's, so both pages of the pager read as one surface, at a
 * `56px` poster — about seven shows to a screen.
 *
 * `overflow-hidden` is the hold's: the wash is painted on the card itself and must not
 * escape its corner.
 */
export const CARD =
  "relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-6)] bg-raised plate-line p-2.5";

/** The cards' grid. One column on a phone, two from `sm`, three on a wide desktop. */
export const CARD_GRID = "stagger-rise grid gap-2 px-gutter sm:grid-cols-2 2xl:grid-cols-3";

export const CARD_POSTER_WIDTH = 56;

export const CARD_POSTER = "w-14 shrink-0 [--poster-radius:var(--radius-4)]";

/**
 * The featured card — issue #362: the show watched most recently, drawn across the whole
 * grid row. The same raised material as `CARD`; on a phone the still sits above the text
 * and the check beside the text, from `sm` they sit in one row.
 */
export const FEATURED_CARD =
  "relative flex items-end gap-3 overflow-hidden rounded-[var(--radius-6)] bg-raised plate-line p-2.5 sm:col-span-2 sm:items-center 2xl:col-span-3";

/**
 * The featured card's wash, over its poster tint (`app/poster-tint.ts`, `.poster-tint` in
 * `app/globals.css`): the tint in the corner the picture sits in, fading into the card's own
 * ground — the title page hero's gradient, turned for a card.
 */
export const FEATURED_WASH = "linear-gradient(135deg, var(--tint), var(--color-raised) 75%)";
