"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { episodeFullName } from "@/app/(signed-in)/library/season-grouping";
import {
  watchMarks,
  type WatchMarkPhase,
  type WatchMarkView,
  type WatchMarks,
  type WatchNaming,
  type WatchSubject,
} from "@/app/(signed-in)/library/watch-marks";
import type { OngoingEntry, QueuedEpisode, UpNextQueue } from "@/db/access";

/**
 * An Ongoing tile's mark, over the marks store the episode row already writes through —
 * issue #220, which **reopens #138**.
 *
 * ── What this is, and what it deliberately is not ────────────────────────────────────
 *
 * It is a *reading* of `watch-marks.ts`, and nothing else. The write, the idempotency key,
 * the rollback and the toast all stay there, keyed by **episode** rather than by surface —
 * which is the property this whole ticket leans on. A tile and a title sheet showing the
 * same episode share one mark, one key and one toast by construction, exactly as the
 * desktop TONIGHT row and the programme note once did (`watch-marks.ts`'s own docblock is
 * where that argument lives). #220's *one key per outstanding write, per episode rather
 * than per surface* is therefore not implemented here; it is inherited, and the tests are
 * what hold it.
 *
 * `use-watch-mark.ts` is the same idea for **one** episode, and this is not built on it
 * for one reason: a tile does not know which episode it is showing until it has read the
 * store, and a hook cannot be called once per queued episode when the queue's length is a
 * prop. So the subscription is taken over the whole run at once.
 *
 * ── The tile's position is derived, never stored ─────────────────────────────────────
 *
 * *Which episode is this tile showing* is **the first episode of its queue that the store
 * does not say is watched**. That is a derivation and not a counter, and the difference is
 * the whole of the optimism and the whole of the reversal:
 *
 * - a press marks `episodes[i]`, the store flips it to watched *before the server answers*,
 *   and the tile is showing `episodes[i + 1]` on the next render — the advance;
 * - the write fails, `watch-marks.ts` rolls that episode back, and the tile is showing
 *   `episodes[i]` again — with the toast the store raised, which is the only thing on
 *   screen that says the watch was lost;
 * - *Undo* unwatches it, and the tile walks back by the same rule rather than by a second
 *   one that could disagree with the first.
 *
 * A stored index would need every one of those three to remember to move it, and the one
 * that forgot would be a tile pointing at an episode the reader has already watched.
 *
 * ── The seed is *unwatched*, and that is a fact rather than an assumption ────────────
 *
 * Every episode in the queue sits at or after `library_entry_up_next`'s episode, which is
 * the first episode after the reader's **highest** watched one (`db/views.ts`). Nothing at
 * or after it can carry a watch. So a queued episode no surface has shown yet is unwatched,
 * and this seeds the store with that rather than with a flag the read would have to carry.
 */

/**
 * How long *Undo* stands in the mark slot after a press — issue #220.
 *
 * **Six seconds, and it is a window on a fumble rather than a deadline on a decision.**
 * The scene it serves is #215's: a thumb landing on the wrong tile while a track is still
 * moving under it, noticed immediately or not at all. A reader who changes their mind
 * about a show tomorrow has the episode row's own *Unwatch*, one tap away in the sheet the
 * tile opens.
 *
 * **This is not the toast's timer, and the rule it would break does not apply here.**
 * `AGENTS.md`: *do not add a timer* is about the write-failure toast, because a notice of
 * a lost write that expires makes the write silent again. Nothing expires here — the watch
 * is recorded either way, and what the window ends is an *offer*, not a report. What it
 * buys is the slot going back to being a mark control, so the next episode is one tap away
 * rather than trapped behind a reversal nobody wanted.
 */
export const UNDO_WINDOW_MS = 6_000;

/** What one Ongoing tile renders and presses. */
export interface UpNextMark {
  /**
   * The episode a press would record, or `null` when this tile's run is spent — either
   * because the show has no released episode left (`finished`) or because the queue's cap
   * was reached (`UpNextQueue`'s own table).
   */
  readonly episode: QueuedEpisode | null;
  /**
   * Nothing released is left on this title: **the tile leaves the group.**
   *
   * Distinct from `episode === null`, and the distinction is `UpNextQueue.more`. A tile
   * that has merely run out of *queue* is still a show with episodes to watch, and
   * removing it would be the surface claiming a show finished because a constant is four.
   */
  readonly finished: boolean;
  /** A write against the episode above is on the wire — the control must not be pressed
   *  again while it is. */
  readonly pending: boolean;
  /** The episode this tile has just recorded, while the reversal is still offered.
   *  `null` the moment the window closes, the reader marks again, or the write is rolled
   *  back — a failed mark has nothing to undo. */
  readonly undoable: QueuedEpisode | null;
  /** The just-marked episode's animation phase, so the slot can play the sweep once. */
  readonly phase: WatchMarkPhase;
  mark(): void;
  undo(): void;
  /** The sweep ended. */
  settle(): void;
}

/** What a queued episode is called wherever it is named — the toast included. */
export function queuedEpisodeFullName(episode: QueuedEpisode): string {
  return episodeFullName({
    seasonNo: episode.seasonNo,
    episodeNo: episode.episodeNo,
    name: episode.episodeName,
  });
}

function subjectOf(libraryEntryId: string, episode: QueuedEpisode): WatchSubject {
  return { libraryEntryId, episodeId: episode.episodeId };
}

/**
 * What a queued episode looks like to a surface that has never shown it — see the seed
 * argument in this module's docblock. Frozen at module scope so every subscription hands
 * the store the same object rather than a fresh one per render.
 */
const UNWATCHED: WatchMarkView = { watched: false, phase: "unwatched", pending: false };

/**
 * Everything a tile needs from the store, as one string.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`, so the snapshot has to be
 * either a stable object identity or a primitive. It is a primitive here — the position,
 * the in-flight flag and the phase, in that order — because there is no object the store
 * hands out that carries all three, and building one per call would re-render for ever.
 *
 * Everything the tile renders is decoded back out of this rather than read from the store
 * a second time during render, which is what keeps what it draws and what it re-rendered
 * for the same answer.
 */
function encode(marks: WatchMarks, libraryEntryId: string, queue: UpNextQueue): string {
  let position = 0;
  while (position < queue.episodes.length) {
    const view = marks.read(subjectOf(libraryEntryId, queue.episodes[position]));
    if (!view?.watched) break;
    position += 1;
  }

  const current = queue.episodes[position] ?? null;
  const pending =
    current === null
      ? false
      : (marks.read(subjectOf(libraryEntryId, current))?.pending ?? false);

  // The episode a press has just recorded, which is the one the sweep plays over.
  const marked = position > 0 ? queue.episodes[position - 1] : null;
  const phase: WatchMarkPhase =
    marked === null
      ? "unwatched"
      : (marks.read(subjectOf(libraryEntryId, marked))?.phase ?? "settled");

  return `${position}|${pending ? "1" : "0"}|${phase}`;
}

interface Position {
  readonly position: number;
  readonly pending: boolean;
  readonly phase: WatchMarkPhase;
}

function decode(snapshot: string): Position {
  const [position, pending, phase] = snapshot.split("|");
  return {
    position: Number(position),
    pending: pending === "1",
    phase: phase as WatchMarkPhase,
  };
}

/**
 * What a tile shows, with no React in it — issue #220.
 *
 * The hook below is this plus a subscription and the *Undo* window; every rule about
 * *which episode is this tile on* and *is it still in the group* is here, where
 * `tests/up-next-tile-mark.test.ts` drives it against a fake writer and a real store. That
 * split is the same one `watch-marks.ts` and `use-watch-mark.ts` already draw, and for the
 * same reason: this suite has no DOM, deliberately, so behaviour that only exists inside a
 * hook is behaviour nothing can assert.
 */
export interface UpNextMarkReading {
  /** The episode a press would record, or `null` when the run is spent. */
  readonly episode: QueuedEpisode | null;
  /** The episode a press has already recorded — what *Undo* would reverse. */
  readonly marked: QueuedEpisode | null;
  /** Nothing released is left: the tile leaves the group. */
  readonly finished: boolean;
  readonly pending: boolean;
  readonly phase: WatchMarkPhase;
}

export function readUpNextMark(
  marks: WatchMarks,
  libraryEntryId: string,
  queue: UpNextQueue,
): UpNextMarkReading {
  const { position, pending, phase } = decode(encode(marks, libraryEntryId, queue));
  return {
    episode: queue.episodes[position] ?? null,
    marked: position > 0 ? queue.episodes[position - 1] : null,
    finished: position >= queue.episodes.length && !queue.more,
    pending,
    phase,
  };
}

/**
 * Whether this tile still belongs in the Ongoing group — the rule, written once.
 *
 * `ongoing-group.tsx` asks it of every entry so that a group whose last tile has been
 * marked away takes its heading with it, and `OngoingTile` asks it of itself so that the
 * tile stops rendering. Two callers, one rule: a group that disagreed with its own tiles
 * would leave a heading over an empty track, which §9 forbids as surely as a count would.
 */
export function stillMarkable(
  marks: WatchMarks,
  libraryEntryId: string,
  queue: UpNextQueue,
): boolean {
  return !readUpNextMark(marks, libraryEntryId, queue).finished;
}

/** Record a watch of `episode` from a tile. The key, the rollback and the toast are all
 *  `watch-marks.ts`'s — this only chooses the subject and the naming. */
export function markFromTile(
  marks: WatchMarks,
  entry: Pick<OngoingEntry, "libraryEntryId" | "titleName">,
  episode: QueuedEpisode,
): Promise<void> {
  return marks.mark(
    subjectOf(entry.libraryEntryId, episode),
    namingFor(entry.titleName, episode),
  );
}

/** Take one back — the same store's `unwatch`, which removes every watch of that episode
 *  (#145) and raises its own toast, without a *Try again*, if the delete is lost. */
export function undoFromTile(
  marks: WatchMarks,
  entry: Pick<OngoingEntry, "libraryEntryId" | "titleName">,
  episode: QueuedEpisode,
): Promise<void> {
  return marks.unwatch(
    subjectOf(entry.libraryEntryId, episode),
    namingFor(entry.titleName, episode),
  );
}

/**
 * Subscribe to every episode in a run, as one subscription.
 *
 * `watch-marks.ts` subscribes per episode, so this is the composition of those — and the
 * unsubscribes are collected in order and run in order, because a listener left attached
 * to an episode a tile no longer shows is a re-render nobody asked for.
 */
function subscribeToQueue(
  marks: WatchMarks,
  libraryEntryId: string,
  queue: UpNextQueue,
  onChange: () => void,
): () => void {
  const offs = queue.episodes.map((episode) =>
    marks.subscribe(subjectOf(libraryEntryId, episode), UNWATCHED, onChange),
  );
  return () => {
    for (const off of offs) off();
  };
}

/**
 * One Ongoing tile's mark — issue #220.
 *
 * `marks` is injectable for the reason every store in this build is: `watch-marks.ts` takes
 * its writer, its failure store and its key minter as arguments precisely so the behaviour
 * can be exercised without a browser, and a hook that reached for the module-level instance
 * would put this half of the behaviour out of that reach.
 */
export function useUpNextMark(
  entry: OngoingEntry,
  marks: WatchMarks = watchMarks,
): UpNextMark {
  const { libraryEntryId, queue } = entry;

  const subscribe = useCallback(
    (onChange: () => void) => subscribeToQueue(marks, libraryEntryId, queue, onChange),
    [marks, libraryEntryId, queue],
  );
  const read = useCallback(
    () => encode(marks, libraryEntryId, queue),
    [marks, libraryEntryId, queue],
  );
  /**
   * The server snapshot is the seed: nothing has been written yet and there is no store on
   * the server to read one out of — `watch-marks.ts` is a client module for that reason.
   * A run of unwatched episodes encodes to position zero, nothing in flight, no phase.
   */
  const snapshot = useSyncExternalStore(subscribe, read, () => `0|0|unwatched`);
  /**
   * Derived from the snapshot rather than read out of the store a second time during
   * render, so what the tile draws and what it re-rendered for are the same answer.
   * `decode` is `encode`'s inverse and `readUpNextMark` composes both — the memo is what
   * keeps the objects stable between renders that changed nothing.
   */
  const { position, pending, phase } = useMemo(() => decode(snapshot), [snapshot]);

  /**
   * The episode this tile last pressed, and the only piece of state that is *this tile's*
   * rather than the store's. It is not *whether an undo is offered* — that is derived
   * below — because a mark that failed rolls the position back and there is then nothing
   * to reverse, and a flag would have to be told about that separately.
   */
  const [pressed, setPressed] = useState<string | null>(null);

  useEffect(() => {
    if (pressed === null) return;
    const timer = setTimeout(() => setPressed(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [pressed]);

  const episode = queue.episodes[position] ?? null;
  const marked = position > 0 ? queue.episodes[position - 1] : null;
  /**
   * Offered only while the episode behind the tile's position is the one this tile
   * pressed. A rollback moves the position back and takes the offer with it; so does the
   * reader marking the next episode, which is what keeps one slot from offering to undo a
   * press two episodes ago.
   */
  const undoable = marked !== null && marked.episodeId === pressed ? marked : null;

  return {
    episode,
    finished: position >= queue.episodes.length && !queue.more,
    pending,
    undoable,
    phase,
    mark() {
      if (episode === null) return;
      setPressed(episode.episodeId);
      void markFromTile(marks, entry, episode);
    },
    undo() {
      if (undoable === null) return;
      setPressed(null);
      void undoFromTile(marks, entry, undoable);
    },
    settle() {
      if (marked === null) return;
      marks.settle(subjectOf(libraryEntryId, marked));
    },
  };
}

/**
 * What the write-failure toast prints if this write is lost — the title in full and the
 * episode in full, taken from the one function that names an episode
 * (`season-grouping.ts`). There is no parameter here an exception could arrive in, which
 * is `errors/write-failure.ts`'s own structural guarantee restated at a new caller.
 */
function namingFor(titleName: string, episode: QueuedEpisode): WatchNaming {
  return { title: titleName, episode: queuedEpisodeFullName(episode) };
}

/**
 * The Ongoing group's surviving tiles — issue #220.
 *
 * Held by the group rather than by the tiles so that a group whose every tile has been
 * marked away renders nothing at all: `home-group.tsx` already drops a heading over an
 * empty group, and a client-side emptying has to reach the same answer. The rule is
 * `stillMarkable` above, asked once per entry, so this and the tile cannot disagree about
 * which tiles are gone.
 *
 * **The all-five-empty state is not re-derived here.** `up-next-groups.tsx` decides
 * *you're caught up* from five reads that succeeded, on the server, and a library emptied
 * tile by tile between two loads keeps four absent groups and no sentence until the next
 * one. That is a stale empty state rather than a wrong one — every group it would speak
 * for is already absent — and reconstructing it in the browser would mean the phrase that
 * must never stand in for a failed read (`AGENTS.md`) having a second author.
 */
export function useMarkableEntries(
  entries: readonly OngoingEntry[],
  marks: WatchMarks = watchMarks,
): readonly OngoingEntry[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offs = entries.map((entry) =>
        subscribeToQueue(marks, entry.libraryEntryId, entry.queue, onChange),
      );
      return () => {
        for (const off of offs) off();
      };
    },
    [marks, entries],
  );
  /** A string again, and for `useSyncExternalStore`'s reason: the surviving *set* is what
   *  changes, and a fresh array per call would re-render for ever. */
  const read = useCallback(
    () =>
      entries
        .filter((entry) => stillMarkable(marks, entry.libraryEntryId, entry.queue))
        .map((entry) => entry.libraryEntryId)
        .join(","),
    [marks, entries],
  );
  const surviving = useSyncExternalStore(subscribe, read, () =>
    entries.map((entry) => entry.libraryEntryId).join(","),
  );

  return useMemo(() => {
    const live = new Set(surviving === "" ? [] : surviving.split(","));
    return entries.filter((entry) => live.has(entry.libraryEntryId));
  }, [entries, surviving]);
}
