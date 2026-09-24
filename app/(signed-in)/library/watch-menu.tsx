"use client";

import { DIALOG_FRAME } from "@/app/buttons";
import { useEffect, useRef, useState } from "react";

import { GHOST_RECOVERY, GHOST_RECOVERY_COMPACT } from "@/errors/recovery-buttons";
import { unwatchCount } from "./unwatch-confirm";
import { UnwatchIcon } from "./unwatch-icon";
import { watchMarks } from "./watch-marks";

/**
 * The menu a watched row opens — *Rewatch* and *Unwatch*, the two acts that used to be
 * text pills on every row of a finished season and then, briefly, one ambiguous glyph.
 *
 * ── Why these two live behind a gesture now ──────────────────────────────────────────
 *
 * They are the rare half of this row. A reader presses the check every evening and reaches
 * for either of these a few times a year, and both have consequences a stray tap should
 * not have: *Unwatch* removes **every** watch of the episode (#145's rule — *one press,
 * one meaning*), which on one of the 1,156 episodes carrying imported rewatches
 * is years of record. Between the two-pill row and this, the settled
 * mark itself was the unwatch, which was worse than either: a glyph that reads as a
 * *state* deleting history on one tap.
 *
 * So the settled mark is a mark again — it says *watched* and does nothing — and both
 * writes are behind a deliberate press with a word attached to it.
 *
 * ── Rewatch is back, and it is the same write the check makes ────────────────────────
 *
 * `watchMarks.mark` on an already-watched episode, which mints a fresh key and writes a
 * second `watch` row — a rewatch, in exactly the domain's sense. Nothing about the data
 * model changed to allow this; the button was deleted and the rows never stopped existing.
 *
 * It is `attempt` rather than a new store call because it *is* the mark: the row's own
 * optimistic appearance, the same idempotency key discipline, the same lost-write toast.
 * The sweep plays again, which is right — a watch was recorded.
 *
 * ── One dialog, not one per row ──────────────────────────────────────────────────────
 *
 * `mark-up-to-dialog.tsx`'s rule, and its words: *"a `<dialog>` per row would put
 * sixty-two of them in the document to have at most one open."* The season list holds the
 * state and mounts this when a row asks for it, so this opens itself on mount.
 *
 * ── Why a modal rather than a popover anchored to the row ────────────────────────────
 *
 * `<dialog>` with `showModal()` is the one overlay vocabulary this application has, and it
 * brings focus trapping, `Escape`, and the backdrop with it. An anchored popover would be
 * a second overlay system, and it would have to solve being opened by a finger that is
 * still on the row it is anchored to — the case a centred modal does not have.
 *
 * ── Unwatch confirms *inside* this menu, and is separated from Undo — issue #315 ─────
 *
 * `#300`'s problem statement: *Undo* and *Unwatch* sat 12px apart, at identical size,
 * weight and colour, differing by one word — and *Unwatch* removes **every** watch of an
 * episode, imported ones included, unconfirmed, in a product whose name is a claim about
 * the durability of the record. Two changes follow, and neither is wording, because
 * wording is the thing that already failed:
 *
 * - **Distance and a redundant visual signal.** `Unwatch` sits in its own row, below a
 *   `border-hair` rule, rather than beside `Undo` in the same `gap-3` group — and it
 *   carries `UnwatchIcon` beside its label, a shape `Undo` does not have. Neither is a new
 *   button tier: both controls below stay on `GHOST_RECOVERY`, the register `Rewatch` and
 *   `Undo` already wear, because a further tier was already declined and this
 *   is not the ticket that reopens that.
 * - **A confirmation that replaces this dialog's lower half, not a second dialog over it.**
 *   `confirming` below governs which half renders: the episode's name (this file's own
 *   `<h2>`) never leaves the screen, so the reader is never asked to agree to a number
 *   with nothing on screen saying which episode it is about. Pressing `Unwatch` writes
 *   nothing by itself any more — `unwatch()` still makes exactly the write it always did,
 *   moved behind `Unwatch it`, the confirmation's own control to proceed. `Keep it` is the
 *   way back that does not unwatch, and it returns to the plain menu rather than closing
 *   the dialog, on the same reasoning `mark-up-to-dialog.tsx` gives for staying a `<dialog>`
 *   rather than a second one: a phone stacking two modal layers is the thing being avoided,
 *   not modal-ness itself.
 *
 * The confirmation's own sentence names the episode and the count `unwatch-confirm.ts`'s
 * `unwatchCount` computes — in `mark-up-to-dialog.tsx`'s own wording style, the prior art
 * `#300` names for a confirmation that states a number rather than a generic warning.
 * `watches` below is read fresh off `watchMarks` on every render rather than trusted from
 * whatever this menu was opened with, for `mark-up-to.ts`'s own reason: a confirmation
 * naming a count that is not the count that lands is worse than naming none, and nothing
 * that happens *inside* this menu could leave `initialWatches` behind while it is still
 * open regardless — `rewatch`/`undo`/`unwatch` below all close the dialog before writing.
 */
export function WatchMenu({
  libraryEntryId,
  episodeId,
  titleName,
  episodeName,
  initialWatches,
  onClosed,
}: {
  readonly libraryEntryId: string;
  /** `null` for a film, exactly as every other write in this directory allows. */
  readonly episodeId: string | null;
  readonly titleName: string;
  /** The episode's full name, or absent for a film — `LostWrite.episode` is optional for
   *  precisely this reason, so a toast can name a title with no episode. */
  readonly episodeName?: string;
  /** Seeds the confirmation's count until `watchMarks` has an answer of its own — the same
   *  role `useWatchMark`'s own `initialWatches` plays for the row this menu was opened
   *  from. In practice `watchMarks` always already has one: the row that opened this menu
   *  is watched, and a watched row's own `useWatchMark` subscription is what made it so. */
  readonly initialWatches: number;
  readonly onClosed: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const subject = { libraryEntryId, episodeId };
  const naming = { title: titleName, episode: episodeName };
  const named = episodeName ?? titleName;
  const watches = watchMarks.read(subject)?.watches ?? initialWatches;

  function rewatch(): void {
    // Closed first, then written — `MarkUpToDialog`'s order and its reason: the sweep
    // behind this dialog is the feedback, and it is already running by the time the
    // request leaves.
    ref.current?.close();
    void watchMarks.mark(subject, naming);
  }

  function undo(): void {
    ref.current?.close();
    void watchMarks.undo(subject, naming);
  }

  function unwatch(): void {
    // Still the same write it always made — issue #315 only moves the press that starts
    // it behind a confirmation. Closed first, then written, `MarkUpToDialog`'s order and
    // its reason: the sweep behind this dialog is the feedback, and it is already running
    // by the time the request leaves.
    ref.current?.close();
    void watchMarks.unwatch(subject, naming);
  }

  return (
    // Issue #311 re-narrows the frame: this dialog shared `border-2 border-accent`, the
    // write-failure toast's own frame, though nothing here is a failure — *Unwatch* is
    // a deliberate, confirmed act, not something that went wrong. `border-hair` keeps
    // the same weight and surface.
    <dialog
      ref={ref}
      onClose={onClosed}
      aria-labelledby="watch-menu-h"
      // `dialog-transition` (issue #333, `app/globals.css`): arrives and leaves on a
      // transition rather than a keyframe, because Cancel or Escape can end this dialog
      // before its own entrance has finished.
      className={DIALOG_FRAME}
    >
      {/* Never swapped out by `confirming` — issue #315's acceptance criterion that the
          episode being acted on stays identifiable while the confirmation is shown. */}
      <h2 id="watch-menu-h" className="bill-title text-bill-sm text-text">
        {named}
      </h2>

      {confirming ? (
        <>
          <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
            {/* `unwatchCount`, not "every watch": the generic warning already lives in the
                paragraph below, said once before any control is pressed. This is the number
                the reader is actually agreeing to, in `mark-up-to-dialog.tsx`'s own wording
                style — a count first, the thing it is about second. */}
            Unwatching removes {unwatchCount(watches)} of {named}, including any that came
            in with your library. Nothing brings them back.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* The control to proceed — issue #315. `Unwatch it` and not a second `Unwatch`,
                so `tests/watch-menu-sweep.test.ts` can hold this control to the 44px floor
                by its own label rather than finding the row's `Unwatch` a second time. */}
            <button
              type="button"
              onClick={unwatch}
              className={`${GHOST_RECOVERY} h-11 min-w-11`}
            >
              Unwatch it
            </button>

            {/* The way back that does not unwatch — issue #315's acceptance criterion,
                stated as a control rather than left to the dialog's own Escape/backdrop.
                It returns to the plain menu rather than closing the dialog, so a reader who
                changes their mind is not also dropped out of the menu they opened. */}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${GHOST_RECOVERY_COMPACT} h-11 min-w-11`}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
            {/* Both consequences stated, because they are genuinely different and the words
                *rewatch* and *unwatch* do not carry the difference on their own. The second
                sentence is the one that matters: it is the only place in the product that says
                unwatch takes every watch, and it is said before the press rather than after
                it. */}
            Recording a rewatch keeps the watches you already have and adds one. Undoing takes
            back the most recent one and leaves the rest. Unwatching removes every watch of it,
            including any that came in with your library.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Issue #314: `h-11 min-w-11` raises all four controls below to the 44px platform
                minimum in both dimensions — measured at 34.2px tall, 26.2px for Cancel, against
                it. `GHOST_RECOVERY`/`GHOST_RECOVERY_COMPACT` stay untouched: both are shared by
                a dozen-plus surfaces with no sizing complaint of their own, and the established
                way to reach 44px at one call site without moving the rest is composing it there
                — `list-row.tsx`'s `h-11` and `selection-action-bar.tsx`'s `h-11` on its own
                compact pair are the prior art. `h-11`/`min-w-11` are `2.75rem`, the same 44px
                `RECORDING_HIT_BOX`'s `w-11 h-11` already resolves to, and Tailwind's border-box
                preflight makes `h-11` exact regardless of the padding either treatment carries.
                `tests/watch-menu-sweep.test.ts` holds all four to it. */}
            <button type="button" onClick={rewatch} className={`${GHOST_RECOVERY} h-11 min-w-11`}>
              Rewatch
            </button>

            {/* **Undo lives here and nowhere else.** It was a glyph in the row's trailing
                slot, offered only for a mark made on this visit — which meant the row swapped
                one control for another and back, and meant the store had to know which surface
                had pressed. Neither is true now: the slot holds the mark in every state, and
                *Undo* is simply the middle item of the three things a watched row can be
                asked. It is the same write either way (`db/access.ts`'s `undoWatch` — the
                newest row, never all of them). */}
            <button type="button" onClick={undo} className={`${GHOST_RECOVERY} h-11 min-w-11`}>
              Undo
            </button>

            {/* The way out, at the compact measure — `delete-list-dialog.tsx`'s own
                arrangement: the acts at the surface measure, the dismissal quieter beside
                them. `formMethod="dialog"` closes without a handler, which is what `<dialog>`
                gives for free and what keeps `onClosed` the single close path. Cancel is the
                smallest and easiest to overlook of the four (#314), so it takes the same
                `h-11 min-w-11` floor rather than being left at the compact treatment's own
                26.2px. */}
            <form method="dialog" className="contents">
              <button
                type="submit"
                className={`${GHOST_RECOVERY_COMPACT} h-11 min-w-11`}
              >
                Cancel
              </button>
            </form>
          </div>

          {/* `Unwatch` on its own, below a rule — issue #315. Distance from `Undo` above
              (a fresh `mt-4`/`pt-4` gap plus `border-hair`, rather than the same `gap-3`
              group) and a redundant visual signal beyond wording (`UnwatchIcon`, a shape
              `Undo` does not carry). Still `GHOST_RECOVERY`, the same register as the row
              above — a further button tier was already declined, and a
              redundant *signal* is not one: nothing here paints a colour the other two
              controls do not already use. */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hair pt-4">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`${GHOST_RECOVERY} h-11 min-w-11 inline-flex items-center gap-1.5`}
            >
              <UnwatchIcon className="h-4 w-4" />
              Unwatch
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
