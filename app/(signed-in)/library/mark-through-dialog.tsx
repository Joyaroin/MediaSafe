"use client";

import { useEffect, useRef } from "react";

import type { EpisodeDetail } from "@/db/access";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { markThroughCount } from "./mark-through";
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
 * this is removal's footprint instinct pointing the other way (`remove-title-form.tsx`
 * counts what a removal destroys): the number is what makes the size of the action
 * visible while it can still be stopped.
 *
 * The number is drawn from the episodes in front of the reader (`mark-through.ts`), not
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
 * `markThrough` is optimistic, as every watch write in this application is), so the
 * result of the press is the thing behind the dialog. Holding the dialog open over it
 * would hide the only feedback there is. A lost write raises the toast, once, exactly as
 * it does for a single mark.
 *
 * That is also why there is no in-flight state and no disabled confirm here: the control
 * is gone from the screen before the request has been answered.
 */
export function MarkThroughDialog({
  libraryEntryId,
  titleName,
  through,
  covered,
  onClosed,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly through: EpisodeDetail;
  /** What this press would record — never empty, per `coveredThrough`. */
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
  const count = markThroughCount(covered);

  function confirm(): void {
    // Closed first, then written: the strike behind this dialog is the feedback, and it
    // is already happening by the time the request leaves.
    ref.current?.close();
    void watchMarks.markThrough(
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
    <dialog
      ref={ref}
      onClose={onClosed}
      aria-labelledby="mark-through-h"
      className="border-2 border-accent bg-ground p-6 text-text backdrop:bg-ground/80"
    >
      <h2 id="mark-through-h" className="bill-title text-bill-sm text-text">
        Watched up to here?
      </h2>

      <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
        {/* The count first, because the count is the thing being agreed to — and the
            episode named in full after it, because `CONTEXT.md` says an episode is never
            referred to by number alone and this sentence is where the reader checks that
            the row they pressed is the row they meant. */}
        This records {count} — everything up to and including {fullName}. Specials are
        left alone, and anything already recorded stays as it is.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={confirm} className={GHOST_RECOVERY}>
          Record {count}
        </button>

        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-text"
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
