"use client";

import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { recordWatchAction } from "./watch-action";

export type WatchMarkPhase = "unwatched" | "marking" | "settled";

/**
 * The optimistic three-phase state behind one strike-and-stamp mark — extracted from
 * issue #88's `EpisodeLine` so the film recording control (#90) drives the exact same
 * write, the exact same idempotency and the exact same rollback instead of a second
 * implementation of any of the three. `programme-note-episodes.tsx`'s own docblock is
 * still the source of truth for what the three phases mean and why `watched` and `phase`
 * are deliberately two different pieces of state — this only holds the state, not the
 * reasoning.
 *
 * `episodeId` is `null` for a film, exactly as `RecordWatchParams` already allows.
 * `episodeName` is left absent for a film for the same reason: `LostWrite.episode` is
 * optional precisely so the toast can name a title with no episode.
 */
export function useWatchMark({
  initialWatched,
  libraryEntryId,
  episodeId,
  titleName,
  episodeName,
  onRecorded,
}: {
  readonly initialWatched: boolean;
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
  const [watched, setWatched] = useState(initialWatched);
  const [phase, setPhase] = useState<WatchMarkPhase>(initialWatched ? "settled" : "unwatched");
  const key = useRef<string | null>(null);
  const raised = useRef<WriteFailureHandle | null>(null);

  /**
   * A function declaration, not `useCallback`, for the same reason `EpisodeLine` gave
   * this shape originally: it is handed to the toast as `retry`, and closes over nothing
   * that changes across the life of this row.
   */
  async function attempt(): Promise<void> {
    if (key.current === null) key.current = crypto.randomUUID();

    setWatched(true);
    setPhase("marking");

    const outcome = await record(key.current);

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing besides the reader that ever takes this toast down.
      raised.current?.resolve();
      raised.current = null;
      onRecorded?.();
      return;
    }

    setWatched(false);
    setPhase("unwatched");

    // One toast per lost write, not one per attempt.
    if (raised.current) return;

    raised.current = writeFailures.raise({
      title: titleName,
      episode: episodeName,
      reference: outcome.reference,
      retry: () => void attempt(),
    });
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

  return { watched, phase, attempt, settle: () => setPhase("settled") };
}
