"use client";

import { DIALOG_FRAME } from "@/app/buttons";
import { useEffect, useRef } from "react";

import type { EpisodeDetail } from "@/db/access";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { markUpToCount } from "./mark-up-to";
import { episodeFullName } from "./season-grouping";
import { watchMarks } from "./watch-marks";

/**
 * The count, before anything is written — issue #196.
 *
 * ── Why there is a confirmation at all ───────────────────────────────────────────────
 *
 * Every other recording control in this application writes on the press, because every
 * other one writes **one row** and the row it writes is the row under the thumb. This one
 * can write sixty-two, and nothing on screen would say so until they were all struck. So
 * this is removal's footprint instinct pointing the other way — `titles/[entryId]/remove/page.tsx`
 * draws the watches a removal destroys as a counted figure, on the grounds that *118
 * watches is a different decision from none*: the number is what makes the size of the
 * action visible while it can still be stopped.
 *
 * The number is drawn from the episodes in front of the reader (`mark-up-to.ts`), not
 * asked for over the wire. A round trip in front of a confirmation is a spinner where a
 * number should be, and the reader is agreeing to what they can see.
 *
 * ── A dialog, and this one is the easy case ──────────────────────────────────────────
 *
 * `delete-list-dialog.tsx` makes the argument for the native `<dialog>` — the backdrop,
 * the focus trap and Escape for free — and for a dialog over its own route: leaving a page
 * is a deliberate act, and only account deletion and removal are irreversible enough to
 * earn one. This is *less* than a list deletion, not more: nothing here is destroyed at
 * all, and every episode it writes can be taken back one press at a time by the unwatch
 * control the same rows carry (issue #145).
 *
 * The confirm is `GHOST_RECOVERY` for the same reason that one is: `errors/recovery-buttons.ts`
 * reserves solid accent for *the one primary recovery action*, and this is not recovery.
 *
 * ── It closes on the press, and does not wait ────────────────────────────────────────
 *
 * `DeleteListDialog` holds itself open until its write answers, because a deleted list
 * disappears out from under the reader and there is nothing left to look at if it fails.
 * The opposite is true here: the rows strike **immediately** (`watch-marks.ts`'s
 * `markUpTo` is optimistic, as every watch write in this application is), so the
 * result of the press is the thing behind the dialog. Holding the dialog open over it
 * would hide the only feedback there is. A lost write raises the toast, once, exactly as
 * it does for a single mark.
 *
 * That is also why there is no in-flight state and no disabled confirm here: the control
 * is gone from the screen before the request has been answered.
 */
export function MarkUpToDialog({
  libraryEntryId,
  titleName,
  through,
  covered,
  onClosed,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly through: EpisodeDetail;
  /** What this press would record — never empty, per `coveredUpTo`. */
  readonly covered: readonly EpisodeDetail[];
  readonly onClosed: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  // Mounted *because* a row was pressed, so it opens itself rather than waiting to be
  // told twice. `ListRow` calls `showModal()` on a dialog that is always mounted; this
  // one is mounted only while there is an episode to confirm, which is what keeps one
  // dialog on the page instead of one per row of a long season.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const fullName = episodeFullName(through);
  const count = markUpToCount(covered);

  function confirm(): void {
    // Closed first, then written: the strike behind this dialog is the feedback, and it
    // is already happening by the time the request leaves.
    ref.current?.close();
    void watchMarks.markUpTo(
      { libraryEntryId, episodeId: through.id },
      covered.map((one) => ({ libraryEntryId, episodeId: one.id })),
      // What the toast says if this is lost. `LostWrite.episode` names *the affected
      // episode*; the affected thing here is a run of them, and the count is what makes
      // the loss legible — a toast naming one episode out of sixty-two would understate
      // what went missing.
      { title: titleName, episode: `${count}, through ${fullName}` },
    );
  }

  return (
    // Issue #311 re-narrows the frame: this dialog shared `border-2 border-accent`, the
    // write-failure toast's own frame, with the two others named — a routine,
    // reversible confirmation is not a failure. `border-hair` keeps the same weight.
    <dialog
      ref={ref}
      onClose={onClosed}
      aria-labelledby="mark-up-to-h"
      // `dialog-transition` (issue #333, `app/globals.css`): arrives and leaves on a
      // transition rather than a keyframe, because Cancel or Escape can end this dialog
      // before its own entrance has finished.
      className={DIALOG_FRAME}
    >
      <h2 id="mark-up-to-h" className="bill-title text-bill-sm text-text">
        Watched up to here?
      </h2>

      <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
        {/* The count first, because the count is the thing being agreed to — and the
            episode named in full after it, because an episode is never
            referred to by number alone and this sentence is where the reader checks that
            the row they pressed is the row they meant. */}
        This records {count} — everything up to and including {fullName}. Specials are
        left alone, and anything already recorded stays as it is.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={confirm} className={GHOST_RECOVERY}>
          Record {count}
        </button>

        {/* `GHOST_RECOVERY`, not the dim underlined text this was written as: issue #195
            landed while this was in flight and took the underline off all fourteen of the
            app's text affordances, `delete-list-dialog.tsx`'s own Cancel included. This is
            the fifteenth and follows it rather than reopening the question —
            `tests/underline-audit.test.ts` is the check that made sure it did. */}
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className={GHOST_RECOVERY}
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
