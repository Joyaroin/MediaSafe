/**
 * The action toast's lifecycle rule — issue #307, an *Undo* offered on the surface where a
 * watch was just recorded, so a mis-press costs one press rather than the hold gesture's
 * hunt on the row itself (`watch-menu.tsx`'s own *Undo*, which this appears **beside** and
 * replaces nothing).
 *
 * ── A separate rule from `errors/write-failure.ts`'s, on purpose ────────────────────────
 *
 * The write-failure toast never times out — *a lost write is never
 * silent* — and that rule is amended, not bent, to make room for this one: a **landed**
 * write is a different event and may expire on its own. Building that as a second mode of
 * the write-failure toast would put a dismiss timer inside the one component whose whole
 * purpose is never dismissing, which is exactly where a future edit gets it wrong. This is
 * a different module, with a different rule, raised by a different write outcome.
 *
 * ── What it is not ───────────────────────────────────────────────────────────────────
 *
 * It holds no state, touches no element and reads no clock — the same split
 * `app/gesture-rules.ts` and `app/restoration.ts` already make, and the spec names both as
 * the shape to follow. `action-toast-store.ts` is the one piece of this pair that is not
 * pure: it holds the actual singleton and the real `setTimeout` that makes the toast
 * dismiss itself, built entirely out of the two functions below.
 *
 * ── Why a dismissal takes an id ──────────────────────────────────────────────────────
 *
 * The store mints a fresh id on every raise and never cancels a running timer by hand —
 * it cannot, once a second mark has replaced the first, because the first offer is gone by
 * then. That timer still fires, on schedule, naming the *first* offer's id. `dismissAction`
 * answers it correctly without ever having to know it was late: a dismissal only ever
 * speaks for the offer it names, exactly as `errors/write-failure.ts`'s own `remove` and
 * `watch-marks.ts`'s key discipline both already hold their write.
 */

/**
 * What the toast offers, and nothing more. There is no field here for a message or a
 * status — the toast composes its own sentence from `title` and `episode`, the same
 * restraint `errors/write-failure.ts`'s `LostWrite` states for itself.
 */
export interface ActionOffer {
  /** The title a watch was just recorded against, named in full. */
  readonly title: string;
  /** The episode, named in full — absent for a film, or for a change to the title itself.
   *  An episode is never referred to by number alone. */
  readonly episode?: string;
  /**
   * Take back the watch this toast is about. Always the newest one — in the glossary's
   * sense of *Undo* — and never *Unwatch*: this toast offers no way to remove every watch
   * of the thing, only the one the press just made.
   */
  readonly undo: () => void;
  /**
   * A second action beside Undo, when the write that raised the toast suggests one —
   * issue #357's *Also mark N earlier*, offered after marking an episode that has
   * unwatched episodes before it. Absent on every other toast.
   */
  readonly also?: { readonly label: string; readonly run: () => void };
}

export interface RaisedAction extends ActionOffer {
  readonly id: string;
}

/** At most one offer showing at a time — a second mark replaces the first rather than
 *  stacking beside it, which is `action-toast-store.ts`'s call each time it raises. */
export interface ActionToastState {
  readonly offer: RaisedAction | null;
}

export const NO_ACTION_TOAST: ActionToastState = { offer: null };

/** Show an offer. Replaces whatever was showing, unconditionally — there is nothing in
 *  the previous state worth keeping once a newer press has happened. */
export function raiseAction(id: string, offer: ActionOffer): ActionToastState {
  return { offer: { ...offer, id } };
}

/** The reader's own dismissal, or the toast's timer, or an `undo` press taking itself
 *  down — all three routes call this, and all three name the offer they mean by its id.
 *  An id that names something other than what is currently showing changes nothing. */
export function dismissAction(state: ActionToastState, id: string): ActionToastState {
  if (state.offer?.id !== id) return state;
  return NO_ACTION_TOAST;
}
