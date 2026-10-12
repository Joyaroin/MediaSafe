import { THE_BUTTON_REGISTER } from "./accent-meaning";
import { IN_FLIGHT } from "./button-states";

/**
 * The buttons — issue #357's three kinds, redrawn for Charcoal (issue #397, handoff §5.2
 * and §6). There is no accent hue any more, so emphasis is a shape, not a colour:
 *
 * - **Primary** is *filled* — `text` ground, `ground` ink. The one main action on a
 *   surface (a screen, a dialog, a sheet or a toast), and nothing else. Search's per-row
 *   *Add* pill is the one exception: each is the main action of its own row.
 * - **Secondary** is *quiet* — `raised` on the page, `hair` on a card or dialog
 *   (`quiet-fill`, `app/globals.css`). Every other action.
 * - **Plain** is text alone — links, tertiary actions, *Dismiss*.
 * - **Destructive** is *danger* — a `1px` inset `danger` line and `danger` text, never a
 *   fill at rest, so it cannot be mistaken for the filled action beside it.
 *
 * The fifth treatment, *outlined*, means *selected* and is not a button: it lives in
 * `app/selection.ts`, and no button wears it.
 *
 * ── Heights, and the text that goes with each ────────────────────────────────────────
 *
 * Three heights, and the label's size follows the height whatever the variant: `56px`
 * at Row size (`LARGE` — Tonight's featured action, sign in, first run), `48px` at
 * Control size (the default), `44px` at Body size (`COMPACT` — inside cards, toasts and
 * rows). `44px` is the floor: there is no smaller button, because every control is at
 * least a `44px` target. The old `36px` compact measure is gone for that reason.
 *
 * All of them carry `IN_FLIGHT`, so a button disabled while its write is in flight dims
 * and shows the wait cursor the same way.
 */

const BASE = `inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-5)] font-semibold transition-[filter,color,background-color] duration-[var(--dur-fast)] ${IN_FLIGHT}`;

const LARGE = "h-14 min-w-14 px-6 text-row";
const REGULAR = "h-12 min-w-12 px-5 text-bill-xs";
const COMPACT = "h-11 min-w-11 px-4 text-note";

const FILLED = THE_BUTTON_REGISTER.solid;

const PRIMARY = `${FILLED} hover:brightness-95`;
const SECONDARY = "quiet-fill text-text";
const PLAIN = "text-text hover:text-dim";
const DESTRUCTIVE = "danger-line text-danger hover:bg-danger hover:text-ground";

export const PRIMARY_BUTTON_LARGE = `${BASE} ${LARGE} ${PRIMARY}`;
export const PRIMARY_BUTTON = `${BASE} ${REGULAR} ${PRIMARY}`;
export const PRIMARY_BUTTON_COMPACT = `${BASE} ${COMPACT} ${PRIMARY}`;

export const SECONDARY_BUTTON = `${BASE} ${REGULAR} ${SECONDARY}`;
export const SECONDARY_BUTTON_COMPACT = `${BASE} ${COMPACT} ${SECONDARY}`;

/** Text alone, at the `44px` floor — the lost-write toast's *Dismiss*. */
export const PLAIN_BUTTON = `${BASE} ${COMPACT} ${PLAIN}`;

/** A quiet button that is only an icon — a `44px` circle, so no padding to override. */
export const ICON_BUTTON = `${BASE} h-11 w-11 rounded-[var(--radius-full)] ${SECONDARY}`;

/** One row of a menu — the title page's *…* menu. Colour is the caller's: text, or danger.
 *  Its hover is the quiet fill, so it still shows inside the raised dialog it opens in. */
export const MENU_ITEM =
  "flex h-11 w-full items-center rounded-[var(--radius-4)] px-3 text-left text-item hover:quiet-fill";

export const DESTRUCTIVE_BUTTON = `${BASE} ${REGULAR} ${DESTRUCTIVE}`;
export const DESTRUCTIVE_BUTTON_COMPACT = `${BASE} ${COMPACT} ${DESTRUCTIVE}`;

/**
 * The pill — one size where the boards drew three (*Add*, *I've seen it*, *Start again* at
 * `28`, `30` and `34px`). Two elements, because the pill draws `32px` and the target is
 * `44px`: `PILL_TARGET` is the `<button>` — a button's hit area is its own border box and
 * nothing its parent adds reaches it — and the face is a `<span>` inside it.
 *
 * `PRIMARY_PILL` is filled, for *Add*; `SECONDARY_PILL` is quiet, for everything else.
 */
export const PILL_TARGET = `flex h-11 shrink-0 items-center ${IN_FLIGHT}`;

const PILL = "flex h-8 items-center gap-1.5 rounded-[var(--radius-full)] px-3.5 text-item font-semibold";

export const PRIMARY_PILL = `${PILL} ${FILLED}`;
export const SECONDARY_PILL = `${PILL} quiet-fill text-text`;

/**
 * Every modal `<dialog>`'s frame — one shape, one hairline, one entrance. Raised since
 * Charcoal, so a quiet button or a field inside takes its on-card form by itself
 * (`.bg-raised` in `app/globals.css`). It keeps its `border` and its one shadow rather
 * than taking `plate-line`: both are box-shadows, and two on one element is a fight over
 * which Tailwind emits last.
 *
 * `m-auto` puts back the browser's own centring: Tailwind's preflight zeroes every
 * element's margin, `<dialog>`'s `margin: auto` included, and without it a modal opened
 * pinned to the top-left corner (found on Lists' delete dialog, issue #402).
 */
export const DIALOG_FRAME =
  "dialog-transition m-auto rounded-[var(--radius-7)] border border-hair bg-raised p-6 text-text shadow-[0_24px_64px_rgb(0_0_0/0.3)] backdrop:bg-ground/80";

/**
 * The outlined panel — handoff §6. No fill, a `1px` `hair` line, `--radius-6`, `20px` in.
 * It holds the empty states and the inline failures (`errors/failure-treatment.ts`), so
 * the two share a frame and differ by their words and their heading — never by an alarm
 * colour, which the error discipline would not let them use to tell each other apart.
 */
export const OUTLINED_PANEL = "rounded-[var(--radius-6)] hair-line p-5";

/** An empty state: the outlined panel, inset by the page gutter. The empty components
 *  share it, left-aligned, where each used to centre itself in open page. */
export const EMPTY_PANEL = `mx-gutter mt-5 ${OUTLINED_PANEL}`;
