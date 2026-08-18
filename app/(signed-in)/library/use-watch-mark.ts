"use client";

import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { recordWatchAction, undoWatchAction } from "./watch-action";

export type WatchMarkPhase = "unwatched" | "marking" | "settled";

/**
 * Everything about one row that a press changes, in one object.
 *
 * They are one piece of state and not three because every write here sets all three at
 * once and a failure puts all three back — and *back* has to mean the appearance the row
 * had at the moment of that press, captured then rather than reconstructed later. Three
 * `useState`s would make the rollback three statements that can drift out of step, and
 * two of the three are only ever wrong in ways nothing on screen would show.
 */
export interface WatchAppearance {
  /** Struck, in the reader's eye. Flips before the server has answered. */
  readonly watched: boolean;
  /** Whether there is an app watch to take back — `db/access.ts`'s `EpisodeDetail`. */
  readonly undoable: boolean;
  readonly phase: WatchMarkPhase;
}

/**
 * The optimistic state behind one row's watch — extracted from issue #88's `EpisodeLine`
 * so the film recording control (#90) drives the exact same write, the exact same
 * idempotency and the exact same rollback instead of a second implementation of any of
 * the three. `programme-note-episodes.tsx`'s own docblock is still the source of truth
 * for what the three phases mean and why `watched` and `phase` are deliberately separate;
 * this holds the state, not the reasoning.
 *
 * `episodeId` is `null` for a film, exactly as `RecordWatchParams` already allows.
 * `episodeName` is left absent for a film for the same reason: `LostWrite.episode` is
 * optional precisely so the toast can name a title with no episode.
 *
 * ── Issue #89 adds taking one back, and it belongs here ──────────────────────────────
 *
 * `undo` is on this hook rather than in the episode row because the rollback is: a mark
 * and an undo write the *same three fields* and put the same three back on failure, and
 * two implementations of that is how the two come to disagree. `FilmRow` does not call
 * `undo` — a film's undo is not #89's scope, which is the watched *episode* — and the
 * hook makes no decision about that; it offers the write, the row decides whether to draw
 * a control for it.
 */
export function useWatchMark({
  initialWatched,
  initialUndoable = false,
  libraryEntryId,
  episodeId,
  titleName,
  episodeName,
  onRecorded,
}: {
  readonly initialWatched: boolean;
  /** Absent for a film, which draws no undo control and so never reads this. */
  readonly initialUndoable?: boolean;
  readonly libraryEntryId: string;
  readonly episodeId: string | null;
  readonly titleName: string;
  readonly episodeName?: string;
  /** Called once a fresh mark (not a stale retry) lands — the film row's only use for
   *  this is patching `state` to `finished`, which a watch always reaches (`CONTEXT.md`:
   *  a film is only ever watchlist, finished or abandoned, and this is the only write
   *  that takes it to the third). An episode has no analogous single destination state,
   *  so `EpisodeLine` passes nothing. */
  readonly onRecorded?: () => void;
}) {
  const [appearance, setAppearance] = useState<WatchAppearance>(() => ({
    watched: initialWatched,
    undoable: initialUndoable,
    phase: initialWatched ? "settled" : "unwatched",
  }));
  const [pending, setPending] = useState(false);
  /**
   * The idempotency key of the watch write that has not landed yet, or `null` when none
   * is outstanding. It names the **write**, not the press — see `attempt`.
   */
  const key = useRef<string | null>(null);
  /**
   * This row's outstanding lost write, and **which of the two it was**.
   *
   * The kind is not bookkeeping. `resolve()` means *the write landed, or the reader no
   * longer needs to see this*, and a landed write only says that about a lost one of the
   * same kind. A mark that lands after a lost mark genuinely settles it — the row is
   * watched, which is what the reader was trying to say. A **rewatch that lands after a
   * lost undo settles nothing**: the undo is still lost, and there is now one more watch
   * than the reader asked for. Resolving there would take the only notice of it off the
   * screen, which is `SPEC.md` §3.3 broken by a write that succeeded.
   */
  const raised = useRef<{ kind: "watch" | "undo"; handle: WriteFailureHandle } | null>(null);

  /**
   * A function declaration, not `useCallback`, for the same reason `EpisodeLine` gave
   * this shape originally: it is handed to the toast as `retry`. What it closes over that
   * matters is `appearance` **as of the render the press happened in**, which is exactly
   * the appearance a failure has to put back — so the rollback needs no parameter and
   * cannot be handed a stale one.
   *
   * ── The key is cleared on success, and only there ──────────────────────────────────
   *
   * Issue #88 minted it once and held it for the life of the row, which was correct while
   * a row could only ever be marked once. It is not correct now that #89 can take a watch
   * back: marked, undone and marked again would give that third gesture the first one's
   * key, `recordWatch` would treat it as a retry, write nothing, and answer *ok* — a
   * struck row with no watch behind it and no error anywhere.
   *
   * Minting one per *press* instead would fix that and open something worse. After a lost
   * mark the row shows its recording control again **and** the toast still offers *Try
   * again*; those are two live controls for one write, and two different keys through them
   * are two rows against the same episode — a phantom rewatch, invisible by inspection
   * next to the 1,156 real ones already in the database.
   *
   * So the key belongs to the write: minted when none is outstanding, reused by every
   * route back to that same write, cleared once one of them has actually landed.
   */
  async function attempt(): Promise<void> {
    const previous = appearance;
    if (key.current === null) key.current = crypto.randomUUID();
    const sourceKey = key.current;

    setPending(true);
    setAppearance({ watched: true, undoable: true, phase: "marking" });

    const outcome = await record(sourceKey);
    setPending(false);

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing besides the reader that ever takes this toast down.
      key.current = null;
      settleToast("watch");
      onRecorded?.();
      return;
    }

    setAppearance(previous);

    // One toast per lost write, not one per attempt.
    if (raised.current) return;

    raised.current = {
      kind: "watch",
      handle: writeFailures.raise({
        title: titleName,
        episode: episodeName,
        reference: outcome.reference,
        retry: () => void attempt(),
      }),
    };
  }

  /**
   * Take one watch back — issue #89.
   *
   * ── Why this one is not offered a retry ───────────────────────────────────────────
   *
   * A lost *insert* is safe to send again: it carries an idempotency key, so the second
   * attempt is either the same row or no row. A lost *delete* carries no such thing.
   * "The response never arrived" and "the delete never happened" are the same event from
   * here, and a retry of the first removes a second watch — the earlier half of a
   * rewatch, gone, with nothing on any screen to say so. That is precisely the silent
   * history edit #89 exists to prevent, so the toast is raised without a `retry`
   * (`errors/write-failure.ts` allows exactly this: *absent when there is nothing
   * sensible to retry*) and the row goes back to being struck. Pressing undo again is
   * then a deliberate act against a row the reader can see.
   */
  async function undo(): Promise<void> {
    const previous = appearance;

    setPending(true);
    // The optimistic guess is *unwatched*, because it is right for every row with one app
    // watch and nothing underneath — which is nearly all of them. Where it is wrong, the
    // outcome below says so and it is corrected rather than left standing.
    setAppearance({ watched: false, undoable: false, phase: "unwatched" });

    const outcome = await removeWatch();
    setPending(false);

    if (outcome.ok) {
      settleToast("undo");
      // What survived, from the table: an imported watch underneath, or the earlier half
      // of a rewatch, both of which leave this row watched. `settled`, never `marking` —
      // nothing was recorded here, so nothing is stamped.
      setAppearance({
        watched: outcome.watched,
        undoable: outcome.undoable,
        phase: outcome.watched ? "settled" : "unwatched",
      });
      return;
    }

    setAppearance(previous);

    if (raised.current) return;

    raised.current = {
      kind: "undo",
      handle: writeFailures.raise({
        title: titleName,
        episode: episodeName,
        reference: outcome.reference,
      }),
    };
  }

  /** Take the toast down only if it was raised by a lost write of this same kind. */
  function settleToast(kind: "watch" | "undo"): void {
    if (raised.current?.kind !== kind) return;
    raised.current.handle.resolve();
    raised.current = null;
  }

  /**
   * The one failure `recordWatchAction` cannot report itself, turned into the same
   * outcome shape: the request never reaching the server at all.
   */
  async function record(sourceKey: string) {
    try {
      return await recordWatchAction({ libraryEntryId, episodeId, sourceKey });
    } catch (error) {
      return {
        ok: false as const,
        reference: referenceFor(error, { surface: "record-watch" }),
      };
    }
  }

  /** The same wrapper as `record` above, around the delete. */
  async function removeWatch() {
    try {
      return await undoWatchAction({ libraryEntryId, episodeId });
    } catch (error) {
      return {
        ok: false as const,
        reference: referenceFor(error, { surface: "undo-watch" }),
      };
    }
  }

  return {
    ...appearance,
    /** A write of either kind is in flight, so neither control may be pressed again. */
    pending,
    attempt,
    undo,
    /** The strike animation ended. Guarded, so it cannot re-settle a row a failure has
     *  already put back to `unwatched`. */
    settle: () =>
      setAppearance((current) =>
        current.phase === "marking" ? { ...current, phase: "settled" } : current,
      ),
  };
}
