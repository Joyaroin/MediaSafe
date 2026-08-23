/**
 * DESIGN.md, Buttons: *Recovery buttons (`Try again`, `Clear the filter`): the same ghost
 * treatment at `0.5rem 1rem`. The one primary recovery action (`Bring your library in`,
 * `Try again` in the toast) is solid `accent` with `accent-ink` text.*
 *
 * "The same ghost treatment" is one thing, so it is written once. Three surfaces already
 * render it — the read-failure boundary, the root-layout failure, and the toast's
 * *Dismiss* — and a class string copied three times is a treatment that drifts into three
 * treatments the first time one of them is adjusted.
 *
 * These are class strings and not components on purpose. `app/globals.css` says there is
 * no component library in this repository yet and that the omission is deliberate; it also
 * fixes its own contents at a counted number of `@theme` declarations and `@utility`
 * rules, so a further utility is not the home for this either. Naming the treatment is the
 * smallest thing that stops the drift without deciding either of those questions.
 *
 * The count used to be quoted here — *"twenty-one `@theme` declarations and three
 * `@utility` rules"* — and was wrong twice over: `DESIGN.md` §11 caught it reading 21/3
 * against an actual 20/4, and the motion work then moved it again to 25/6. A number
 * duplicated into a file that has no reason to know it is a number that is wrong by
 * default; `DESIGN.md` §9 and the stylesheet's own heading are the two places that state
 * it, and they are enough.
 *
 * When the library surfaces arrive and *Clear the filter* and *Bring your library in* need
 * these too, they move somewhere less specific than `errors/`. They are not errors-only;
 * they are only errors-only today.
 */

/** The recovery action a reader can take. Inverts to solid on hover. */
export const GHOST_RECOVERY =
  "code-line border border-accent px-4 py-2 text-accent transition-colors duration-150 hover:bg-accent hover:text-accent-ink";

/**
 * `GHOST_RECOVERY` at the episode row's own measure — issue #203.
 *
 * **This is the same treatment, not a second one.** Identical border, identical accent,
 * identical hover inversion; `px-2.5 py-1` where the surface-level one takes `px-4 py-2`.
 * `DESIGN.md` §10 records that issue #195 *considered and declined* a third, neutral tier,
 * and that ruling stands — what changes here is a measure, not a register, and the measure
 * was not invented either: it was the episode row's own recording control's, character for
 * character, back when that control was a `code-line` text pill
 * (`app/(signed-in)/library/watch-mark-motion.tsx`'s docblock has the full history). Issue
 * #217 gave that control a checkmark and a real `44px` hit box instead, so `px-2.5 py-1`
 * is no longer a live copy of anything — it is *Rewatch* and *Unwatch*'s own measure now,
 * kept exactly as #203 set it.
 *
 * ── Why the row needed one ───────────────────────────────────────────────────────────
 *
 * #195 moved the episode row's two watched controls onto `GHOST_RECOVERY` without
 * re-measuring the fixed slot they sit in, and `px-4 py-2` does not fit it: the settled
 * watched row went to `50.2px` against every other state's `44px`, so a row grew the
 * moment a mark settled and took every row under it with it — `DESIGN.md` §6's
 * *re-measure if you touch the row*, and the exact property `episode-line.ts` records
 * being measured into existence twice. `programme-note-episodes.tsx`'s `TRAILING` carries
 * the full before/after table.
 *
 * ── `shrink-0` is part of the treatment here, and only here ──────────────────────────
 *
 * Its one caller is a **fixed-measure** flex slot, which is the whole reason this variant
 * exists. A flex child that may shrink is a control whose label wraps to two lines the
 * first time a state runs long, which grows the row again by a different route — the
 * failure this ticket is closing, wearing a different hat. `watch-mark-motion.tsx`'s
 * `RECORDING_HIT_BOX` bakes in `shrink-0` beside the same slot for the same reason. The
 * surface-level `GHOST_RECOVERY` above does not, and must not: it lays out in ordinary
 * flow on a dozen surfaces that have no slot.
 *
 * If a second caller ever wants this measure outside a fixed slot, that is the moment to
 * split the `shrink-0` back out — not before, because a constant with an unused escape
 * hatch is a constant nobody can read the intent of.
 */
export const GHOST_RECOVERY_COMPACT =
  "code-line shrink-0 border border-accent px-2.5 py-1 text-accent transition-colors duration-150 hover:bg-accent hover:text-accent-ink";

/**
 * The one primary recovery action on a surface. Pressed state is `brightness(0.9)` over
 * `200ms`, per DESIGN.md's recording control.
 */
export const SOLID_RECOVERY =
  "code-line bg-accent px-4 py-2 text-accent-ink transition-[filter] duration-200 hover:brightness-90";

/**
 * `SOLID_RECOVERY` at `GHOST_RECOVERY_COMPACT`'s measure — issue #199.
 *
 * The same treatment and not a second one, on that constant's terms and for its reason:
 * identical ground, identical ink, identical pressed `brightness(0.9)`; `px-2.5 py-1`
 * where the surface-level one takes `px-4 py-2`. The measure is not invented here either —
 * it is the compact ghost's, character for character, because the two sit **in the same
 * row** and a primary at one measure beside secondaries at another is two rows' worth of
 * spacing in one.
 *
 * ── Why the selection bar needed one ─────────────────────────────────────────────────
 *
 * Issue #199 gives the Library's selection bar a third control, and that bar cannot grow:
 * `app/phone-bar.ts` fixes it at the tab bar's `75px` precisely so the swap moves nothing
 * under it. A count, *Add to list*, *Abandon* and *Done* at the surface measure want more
 * than a 375px phone has between the bar's `22px` margins, so the count would clip on
 * every phone rather than on the narrow ones. This is the same failure #203 re-measured
 * the episode row for, arriving from the other direction: there a fixed slot grew a row,
 * here a fixed row squeezed a label.
 *
 * A `px-3` at the call site was tried before this existed and is the reason the constant
 * is: with no `tailwind-merge` in this project, `.px-4` is emitted after `.px-3` and wins
 * whatever the class string says. An override of a named treatment here is not
 * discouraged, it is inert.
 *
 * `shrink-0` is baked in for `GHOST_RECOVERY_COMPACT`'s reason, which holds exactly as
 * well here: the one caller is a flex row where the controls must keep their measure and
 * the status line beside them is the thing that gives.
 */
export const SOLID_RECOVERY_COMPACT =
  "code-line shrink-0 bg-accent px-2.5 py-1 text-accent-ink transition-[filter] duration-200 hover:brightness-90";

/**
 * How a disabled control is dimmed — **the dim alone, and one string for all of them.**
 *
 * `DESIGN.md`'s Buttons section names no disabled variant, so this is an extension of the
 * system rather than a quotation from it — which is exactly why it is one string in one
 * place rather than a decision taken twice. It was taken twice before this existed:
 * sign-in dimmed with `brightness-75` and sign-out with `opacity-60`, which is off-system
 * entirely. Issue #125's delete button made it three, by writing `disabled:brightness-75`
 * at its own call site to escape `IN_FLIGHT`'s cursor — which is why the dim and the
 * cursor are now separate constants instead of one.
 *
 * `brightness` is the borrowed mechanism, because it is the one the world already uses for
 * a pressed control (`hover:brightness-90` above, and Motion's `brightness(0.9)` on the
 * recording control). It also works on both treatments, where an opacity change would not:
 * the ghost button has no ground to fade, only type and a border.
 */
export const DISABLED_DIM = "disabled:brightness-75";

/**
 * A control that is already working, added to either treatment above.
 *
 * `cursor-wait` and not `cursor-not-allowed`: the control is not refusing, it is busy, and
 * the round trip behind these is a redirect to Google, a session being revoked, or an
 * account being deleted.
 */
export const IN_FLIGHT = `disabled:cursor-wait ${DISABLED_DIM}`;

/**
 * A control that is **refusing** — disabled because the reader has not done the thing that
 * arms it, not because anything is in flight.
 *
 * The counterpart to `IN_FLIGHT`, and a separate constant for the reason that one gives for
 * its own cursor: the two states are not the same state. Issue #125's delete button is the
 * first control in the application that spends most of its life dead on purpose — it arms
 * only once `delete` has been typed exactly — and `cursor-wait` on a control that is waiting
 * for the reader rather than for the server would be a small lie on the one screen that
 * cannot afford one.
 */
export const NOT_YET_ARMED = `disabled:cursor-not-allowed ${DISABLED_DIM}`;
