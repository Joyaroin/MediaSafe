import { IN_FLIGHT } from "@/errors/recovery-buttons";

/**
 * The three kinds of button — issue #357.
 *
 * One accent-outlined pill used to carry every action — Remove, Cancel, Undo, Back and
 * Add to list looked alike, so nothing told the eye which one mattered. Three variants
 * replace it, and each says something different:
 *
 * - **Primary** — the one likely next thing on a surface. Solid accent, dark ink. At most
 *   one per surface, so the accent keeps meaning *this is the main action* (or, on a
 *   check, *watched*).
 * - **Secondary** — every other action. A neutral raised fill: reachable, never loud.
 * - **Destructive** — the action that takes something away. Red text and a red hairline,
 *   never a fill, so it cannot be mistaken for the primary action beside it.
 *
 * Each has a compact size for rows and toolbars. All four carry `IN_FLIGHT`, so a button
 * disabled while its write is in flight dims and shows the wait cursor the same way.
 */

const BASE = `inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-full)] font-semibold transition-[filter,color,background-color] duration-[var(--dur-fast)] ${IN_FLIGHT}`;

const REGULAR = "h-11 min-w-11 px-5 text-item";
const COMPACT = "h-9 min-w-9 px-3.5 text-meta";

const PRIMARY = "bg-accent text-accent-ink hover:brightness-95";
const SECONDARY = "bg-raised text-text hover:text-ink";
const DESTRUCTIVE = "border border-danger text-danger hover:bg-danger hover:text-ground";

export const PRIMARY_BUTTON = `${BASE} ${REGULAR} ${PRIMARY}`;
export const PRIMARY_BUTTON_COMPACT = `${BASE} ${COMPACT} ${PRIMARY}`;

export const SECONDARY_BUTTON = `${BASE} ${REGULAR} ${SECONDARY}`;
export const SECONDARY_BUTTON_COMPACT = `${BASE} ${COMPACT} ${SECONDARY}`;

export const DESTRUCTIVE_BUTTON = `${BASE} ${REGULAR} ${DESTRUCTIVE}`;
export const DESTRUCTIVE_BUTTON_COMPACT = `${BASE} ${COMPACT} ${DESTRUCTIVE}`;

/**
 * Every modal `<dialog>`'s frame — one shape, one hairline, one entrance. The five dialogs
 * used to disagree: the watch menu was rounded and animated, the others square with a
 * heavy border, and two of those did not animate at all.
 */
export const DIALOG_FRAME =
  "dialog-transition rounded-[var(--radius-5)] border border-hair bg-ground p-6 text-text shadow-[0_24px_64px_rgb(0_0_0/0.3)] backdrop:bg-ground/80";
