"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import {
  watchMarks,
  type WatchMarkView,
  type WatchSubject,
} from "./watch-marks";

export type { WatchAppearance, WatchMarkPhase } from "./watch-marks";

/**
 * One surface's view of one episode's watch mark.
 *
 * ── What this is, after issue #103 ───────────────────────────────────────────────────
 *
 * It is the binding, and nothing else. The write, the idempotency key, the rollback and
 * the toast all live in `watch-marks.ts`, keyed by episode, because on desktop the
 * TONIGHT row and the programme note are on screen **at once** and can be showing the
 * same episode — and two component instances holding two optimistic states minted two
 * keys against one episode, which is two rows. That file's docblock is the reasoning;
 * this one holds no state of its own beyond the initial appearance its caller was
 * rendered with.
 *
 * **Still one hook, still one write.** #103 changes where the key is kept, not how many
 * implementations of the write there are: the four callers — `EpisodeLine` and `FilmRow`
 * (`programme-note-episodes.tsx`), `UpNextCard` (`up-next-grid.tsx`) and
 * `UpNextDominantCard` (`up-next/up-next-dominant-card.tsx`) — call this exactly as they
 * did, and get back exactly what they did.
 *
 * `episodeId` is `null` for a film, exactly as `RecordWatchParams` already allows.
 * `episodeName` is left absent for a film for the same reason: `LostWrite.episode` is
 * optional precisely so the toast can name a title with no episode.
 *
 * `undo` is offered to every caller and drawn by one. `FilmRow` does not call it — a
 * film's undo is not #89's scope, which is the watched *episode* — and this makes no
 * decision about that; it offers the write, the row decides whether to draw a control.
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
  /** Called once a mark this surface pressed lands — the film row's only use for this is
   *  patching `state` to `finished`, which a watch always reaches (`CONTEXT.md`: a film is
   *  only ever watchlist, finished or abandoned, and this is the only write that takes it
   *  to the third). An episode has no analogous single destination state, so `EpisodeLine`
   *  passes nothing. */
  readonly onRecorded?: () => void;
}) {
  const subject = useMemo<WatchSubject>(
    () => ({ libraryEntryId, episodeId }),
    [libraryEntryId, episodeId],
  );

  /**
   * What this surface was rendered knowing, from the server read behind it — and only
   * ever a *seed*. It creates the mark if no surface has shown this episode yet, replaces
   * it if one has but nothing has been written to it, and is discarded once something
   * has: past that point the store knows things a server read does not, including a write
   * still in flight. `watch-marks.ts`'s `subscribe` is where that rule lives.
   *
   * Lazy and held in state so its identity is stable: `useSyncExternalStore` compares
   * snapshots by identity, and a fresh object per render would re-render for ever while
   * nothing was outstanding.
   */
  const [initial] = useState<WatchMarkView>(() => ({
    watched: initialWatched,
    undoable: initialUndoable,
    phase: initialWatched ? "settled" : "unwatched",
    pending: false,
  }));

  const subscribe = useCallback(
    (onChange: () => void) => watchMarks.subscribe(subject, initial, onChange),
    [subject, initial],
  );
  const read = useCallback(
    () => watchMarks.read(subject) ?? initial,
    [subject, initial],
  );
  // The server snapshot is the seed: nothing has been written yet, and there is no store
  // on the server to read one out of — `watch-marks.ts` is a client module for that
  // reason. `tests/programme-note.test.ts` and `tests/up-next-grid.test.ts` render through
  // this branch.
  const view = useSyncExternalStore(subscribe, read, () => initial);

  /**
   * Read at press time rather than closed over at subscribe time, so a lost write is
   * named by whichever surface the reader actually pressed — and so the toast's *Try
   * again*, which closes over this, keeps naming it that way.
   */
  const naming = { title: titleName, episode: episodeName };

  return {
    ...view,
    attempt: () => watchMarks.mark(subject, naming, onRecorded),
    undo: () => watchMarks.undo(subject, naming),
    settle: () => watchMarks.settle(subject),
  };
}
