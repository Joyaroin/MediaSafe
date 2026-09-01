"use client";

import { useEffect, useRef } from "react";

import { GHOST_RECOVERY, GHOST_RECOVERY_COMPACT } from "@/errors/recovery-buttons";
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
 * (`docs/adr/0001`) is years of record. Between the two-pill row and this, the settled
 * mark itself was the unwatch, which was worse than either: a glyph that reads as a
 * *state* deleting history on one tap.
 *
 * So the settled mark is a mark again — it says *watched* and does nothing — and both
 * writes are behind a deliberate press with a word attached to it.
 *
 * ── Rewatch is back, and it is the same write the check makes ────────────────────────
 *
 * `watchMarks.mark` on an already-watched episode, which mints a fresh key and writes a
 * second `watch` row — a rewatch, in exactly `CONTEXT.md`'s sense. Nothing about the data
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
 */
export function WatchMenu({
  libraryEntryId,
  episodeId,
  titleName,
  episodeName,
  onClosed,
}: {
  readonly libraryEntryId: string;
  /** `null` for a film, exactly as every other write in this directory allows. */
  readonly episodeId: string | null;
  readonly titleName: string;
  /** The episode's full name, or absent for a film — `LostWrite.episode` is optional for
   *  precisely this reason, so a toast can name a title with no episode. */
  readonly episodeName?: string;
  readonly onClosed: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const subject = { libraryEntryId, episodeId };
  const naming = { title: titleName, episode: episodeName };
  const named = episodeName ?? titleName;

  function rewatch(): void {
    // Closed first, then written — `MarkUpToDialog`'s order and its reason: the sweep
    // behind this dialog is the feedback, and it is already running by the time the
    // request leaves.
    ref.current?.close();
    void watchMarks.mark(subject, naming);
  }

  function unwatch(): void {
    ref.current?.close();
    void watchMarks.unwatch(subject, naming);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClosed}
      aria-labelledby="watch-menu-h"
      className="rounded-2xl border-2 border-accent bg-ground p-6 text-text backdrop:bg-ground/80"
    >
      <h2 id="watch-menu-h" className="bill-title text-bill-sm text-text">
        {named}
      </h2>

      <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
        {/* Both consequences stated, because they are genuinely different and the words
            *rewatch* and *unwatch* do not carry the difference on their own. The second
            sentence is the one that matters: it is the only place in the product that says
            unwatch takes every watch, and it is said before the press rather than after
            it. */}
        Recording a rewatch keeps the watches you already have and adds one. Unwatching
        removes every watch of it, including any that came in with your library.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={rewatch} className={GHOST_RECOVERY}>
          Rewatch
        </button>

        <button type="button" onClick={unwatch} className={GHOST_RECOVERY}>
          Unwatch
        </button>

        {/* The way out, at the compact measure — `delete-list-dialog.tsx`'s own
            arrangement: the acts at the surface measure, the dismissal quieter beside
            them. `formMethod="dialog"` closes without a handler, which is what `<dialog>`
            gives for free and what keeps `onClosed` the single close path. */}
        <form method="dialog" className="contents">
          <button type="submit" className={GHOST_RECOVERY_COMPACT}>
            Cancel
          </button>
        </form>
      </div>
    </dialog>
  );
}
