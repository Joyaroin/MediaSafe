import { OUTLINED_PANEL } from "@/app/buttons";

/**
 * The failure treatment, written once.
 *
 * A failure that replaces a region — or a page — has a fixed shape. Since Charcoal (issue
 * #397, handoff §6) it is the **outlined panel** (`app/buttons.ts`'s `OUTLINED_PANEL`): no
 * fill, a `1px` `hair` line, a Row heading in `text`, and the prose at `text-note` capped at
 * `62ch`. It was a `2px` `accent` top rule and an `accent` heading; with no accent hue left,
 * an accent rule would only have been a `text` rule that looked like an underline.
 *
 * The panel is the empty state's frame too, on purpose. Empty and failed stay apart by
 * what they say and by the heading they say it in — never by an alarm colour.
 *
 * It is written here for the same reason `recovery-buttons.ts` exists, and that file's
 * reasoning is the argument: *a class string copied three times is a treatment that drifts
 * into three treatments the first time one of them is adjusted.* That is not hypothetical
 * here — it had already happened. The sign-out block was first written by hand at
 * `text-bill-sm`, which was then the **write-failure toast's** heading step, so two
 * documented treatments were mixed on one screen; and the read-failure boundary was capping its prose
 * at `60ch`, which is the **zero-match** state's measure, not its own.
 *
 * These are class strings and not components, deliberately, on the grounds `app/globals.css`
 * states: there is no component library in this repository yet and the omission is not an
 * oversight. Naming the treatment is the smallest thing that stops the drift without
 * deciding that question.
 *
 * The **write-failure toast is not one of these** and must not be made one. It is a
 * different treatment at a different heading step on a solid ground inside a border, and
 * the two are separated on purpose: one says a region did not load, the other says
 * something you did was lost.
 */

/** The block itself: the outlined panel. */
export const FAILURE_SECTION = OUTLINED_PANEL;

/** The headline, at Row size — the type table's step for failure headings (handoff §5.3). */
export const FAILURE_HEADING = "text-row font-semibold text-text";

/**
 * The sentences. `62ch` is the measure the type table gives read-failure prose.
 * `text-text` rather than `text-dim`: the sentence explaining what went wrong is
 * the thing the reader is here to read, so it is not the quietest text on screen.
 */
export const FAILURE_PROSE = "mt-2 max-w-[62ch] text-note leading-relaxed text-text";
