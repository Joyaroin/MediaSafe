/**
 * The states a button can be disabled in, shared by every button in the app — the three
 * variants in `app/buttons.ts` and the recovery controls in `errors/recovery-buttons.ts`.
 * Their own module so that neither of those two has to import the other.
 */

/**
 * How a disabled control is dimmed — **the dim alone, and one string for all of them.**
 *
 * The Buttons register names no disabled variant, so this is an extension of the
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
