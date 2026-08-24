"use client";

import { useEffect, useRef } from "react";

import type { EpisodeDetail, LibraryState } from "@/db/access";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { coveredUpTo } from "./mark-up-to";
import { watchMarks } from "./watch-marks";

/**
 * The menu behind the hero's state control — *where this title stands*, and the writes
 * that move it.
 *
 * ── This is not a status picker, and the difference is the whole file ───────────────
 *
 * The screen this follows offers a status you set: *plan to watch*, *completed*, *paused*.
 * MediaSafe cannot offer that. `CONTEXT.md`, **Where a title stands**: *"Four of these
 * five are derived from your watches. Only abandoned is set by hand, because it is the
 * only one your watches cannot tell you."* The four are computed in SQL (`db/views.ts`);
 * there is no column to write. A control that set *finished* would be able to claim you
 * finished a show you have no watches for, and every figure derived from watches — your
 * progress, your stats, your streak — would disagree with it.
 *
 * So this offers **the actions that cause the states**, which is the same menu from the
 * reader's side and a different thing underneath:
 *
 * | Entry | What it writes | State that follows |
 * | --- | --- | --- |
 * | Mark everything watched | a watch for every episode not yet marked | *finished*, or *caught up* |
 * | Give up on this | the one hand-set flag there is | *abandoned* |
 *
 * **Two entries, not three.** The round trip back to *watchlist* would need every watch of
 * the title removed, and `unwatchAction` works on one episode. That is a bulk write which
 * destroys watches irrecoverably and wants a confirmation of its own — its own issue, not
 * a third line quietly added here.
 *
 * ── Why a dialog rather than a dropdown ─────────────────────────────────────────────
 *
 * `mark-up-to-dialog.tsx` and `delete-list-dialog.tsx` made this argument already: the
 * backdrop, the focus trap and Escape come free from `showModal()`, and the platform
 * returns focus to the control that opened it. A dropdown here would be the application's
 * first, with all three written by hand.
 */
export function StateActionsDialog({
  libraryEntryId,
  titleName,
  state,
  episodes,
  onAbandon,
  onClosed,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly state: LibraryState;
  readonly episodes: readonly EpisodeDetail[];
  /** Runs the abandon write, which `AbandonControl` owns — see below. */
  readonly onAbandon: () => void;
  readonly onClosed: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  /**
   * Everything this write would record: `coveredUpTo` against the **last** non-special
   * episode there is.
   *
   * ── Reused rather than re-derived, and that is the point ────────────────────────────
   *
   * *Mark everything watched* is *watched up to here* aimed at the end of the show. Writing
   * the filter again here would be a second definition of which episodes a bulk mark
   * covers, free to drift from the one the season rows already use — and the two disagreeing
   * about specials, or about an episode already watched, would show up as a count in a
   * confirmation that does not match what lands.
   *
   * It means this inherits `coveredUpTo`'s rule exactly, **including that it does not
   * filter by air date.** An unaired episode that TMDB has mirrored is covered by the
   * existing control too, so this is the established behaviour rather than a new decision
   * — but it is a real one, and if a bulk mark should stop at what has aired, the fix
   * belongs in `coveredUpTo` where both callers get it.
   */
  const lastRegular = episodes.filter((one) => one.seasonNo > 0).at(-1);
  const outstanding =
    lastRegular === undefined ? [] : (coveredUpTo(episodes, lastRegular) ?? []);

  const last = lastRegular;

  function markEverything(): void {
    if (last === undefined || outstanding.length === 0) return;

    // Closed first, then written — `mark-up-to-dialog.tsx`'s reasoning: the marks behind
    // the dialog are the feedback and they are already moving as the request leaves.
    ref.current?.close();

    void watchMarks.markUpTo(
      { libraryEntryId, episodeId: last.id },
      outstanding.map((one) => ({ libraryEntryId, episodeId: one.id })),
      // The toast names what was lost. A run of episodes, so the count carries it — a
      // toast naming one episode out of sixty-two would understate the loss.
      { title: titleName, episode: `${outstanding.length} episodes` },
    );
  }

  function giveUp(): void {
    ref.current?.close();
    onAbandon();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClosed}
      aria-labelledby="state-actions-h"
      className="border-2 border-accent bg-ground p-6 text-text backdrop:bg-ground/80"
    >
      <h2 id="state-actions-h" className="bill-title text-bill-sm text-text">
        Where this stands
      </h2>

      <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
        {/* Said plainly, because it is the thing most likely to be misunderstood about
            this application: the state is a consequence, not a setting. */}
        Where a title stands is read from what you have watched, so these are the things
        that change it rather than a list to pick from.
      </p>

      <div className="mt-6 flex flex-col items-start gap-3">
        {outstanding.length === 0 ? null : (
          <button type="button" onClick={markEverything} className={GHOST_RECOVERY}>
            Mark everything watched
          </button>
        )}

        {/* The abandon write itself stays in `AbandonControl` — it owns the optimistic
            flip, the write-failure toast and the retry, and duplicating that here would be
            two implementations of one write with two ways to lose it. This entry presses
            it from a distance. */}
        <button type="button" onClick={giveUp} className={GHOST_RECOVERY}>
          {state === "abandoned" ? "Watching it again" : "Give up on this"}
        </button>

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
