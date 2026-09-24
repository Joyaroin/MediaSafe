/**
 * The failure treatment, written once.
 *
 * The States register gives a failure that replaces a region — or a page — a fixed shape:
 * a `2px` `accent` top rule, the heading at `text-bill-md` in `accent`, and the prose at
 * `text-note` capped at `62ch`. Three surfaces now render it: the read-failure boundary,
 * the sign-in failure, and the sign-out failure in Settings.
 *
 * It is written here for the same reason `recovery-buttons.ts` exists, and that file's
 * reasoning is the argument: *a class string copied three times is a treatment that drifts
 * into three treatments the first time one of them is adjusted.* That is not hypothetical
 * here — it had already happened. The sign-out block was first written by hand at
 * `text-bill-sm`, which is the **write-failure toast's** heading step, so two documented
 * treatments were mixed on one screen; and the read-failure boundary was capping its prose
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

/**
 * The block itself. `2px` `accent` on top, and nothing else — no ground, no border on the
 * other three sides. Depth in this world is surface layering and hairlines
 * (`app/globals.css`).
 */
export const FAILURE_SECTION = "border-t-2 border-accent py-6";

/**
 * The headline. `text-bill-md` is the step the type table names for "the
 * zero-match and read-failure headlines", and `accent` is the one place vermilion appears
 * without a watch having been recorded.
 */
export const FAILURE_HEADING = "bill-title text-bill-md text-accent";

/**
 * The sentences. `62ch` is the measure the type table gives read-failure prose.
 * `text-text` rather than `text-dim`: the sentence explaining what went wrong is
 * the thing the reader is here to read, so it is not the quietest text on screen.
 */
export const FAILURE_PROSE = "mt-4 max-w-[62ch] text-note leading-relaxed text-text";
