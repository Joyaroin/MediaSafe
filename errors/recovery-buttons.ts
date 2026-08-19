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
 * fixes its own contents at twenty-one `@theme` declarations and three `@utility` rules,
 * so a fourth utility is not the home for this either. Naming the treatment is the
 * smallest thing that stops the drift without deciding either of those questions.
 *
 * When the library surfaces arrive and *Clear the filter* and *Bring your library in* need
 * these too, they move somewhere less specific than `errors/`. They are not errors-only;
 * they are only errors-only today.
 */

/** The recovery action a reader can take. Inverts to solid on hover. */
export const GHOST_RECOVERY =
  "code-line border border-accent px-4 py-2 text-accent transition-colors duration-150 hover:bg-accent hover:text-accent-ink";

/**
 * The one primary recovery action on a surface. Pressed state is `brightness(0.9)` over
 * `200ms`, per DESIGN.md's recording control.
 */
export const SOLID_RECOVERY =
  "code-line bg-accent px-4 py-2 text-accent-ink transition-[filter] duration-200 hover:brightness-90";

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
