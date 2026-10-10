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
import type { QueuedEpisode, UpNextEntry, UpNextQueue } from "@/db/access";
import { holdOverWhile } from "./hold-over";

/**
 * One next-episodes card's mark, over the marks store the episode row already writes
 * through — issue #220, which **reopens #138**, widened from the Ongoing group to the
 * whole rail by #250.
 *
 * ── What this is, and what it deliberately is not ────────────────────────────────────
 *
 * It is a *reading* of `watch-marks.ts`, and nothing else. The write, the idempotency key,
 * the rollback and the toast all stay there, keyed by **episode** rather than by surface —
 * which is the property this whole ticket leans on. A card on this rail and an episode row
 * on a title page showing the same episode share one mark, one key and one toast by
 * construction, exactly as the desktop TONIGHT row and the programme note once did (`watch-marks.ts`'s own docblock is
 * where that argument lives). #220's *one key per outstanding write, per episode rather
 * than per surface* is therefore not implemented here; it is inherited, and the tests are
 * what hold it.
 *
 * `use-watch-mark.ts` is the same idea for **one** episode, and this is not built on it
 * for one reason: a card does not know which episode it is showing until it has read the
 * store, and a hook cannot be called once per queued episode when the queue's length is a
 * prop. So the subscription is taken over the whole run at once.
 *
 * ── The card's position is derived, never stored ─────────────────────────────────────
 *
 * *Which episode is this card showing* is **the first episode of its queue that the store
 * does not say is watched**. That is a derivation and not a counter, and the difference is
 * the whole of the optimism and the whole of the reversal:
 *
 * - a press marks `episodes[i]`, the store flips it to watched *before the server answers*,
 *   and the card is showing `episodes[i + 1]` on the next render — the advance;
 * - the write fails, `watch-marks.ts` rolls that episode back, and the card is showing
 *   `episodes[i]` again — with the toast the store raised, which is the only thing on
 *   screen that says the watch was lost;
 * - *Undo* unwatches it, and the card walks back by the same rule rather than by a second
 *   one that could disagree with the first.
 *
 * A stored index would need every one of those three to remember to move it, and the one
 * that forgot would be a card pointing at an episode the reader has already watched.
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
 * The scene it serves is #215's: a thumb landing on the wrong card while a track is still
 * moving under it, noticed immediately or not at all. A reader who changes their mind
 * about a show tomorrow has the episode row's own *Unwatch*, one tap away on the title's
 * own page.
 *
 * **This is not the toast's timer, and the rule it would break does not apply here.**
 * `AGENTS.md`: *do not add a timer* is about the write-failure toast, because a notice of
 * a lost write that expires makes the write silent again. Nothing expires here — the watch
 * is recorded either way, and what the window ends is an *offer*, not a report. What it
 * buys is the slot going back to being a mark control, so the next episode is one tap away
 * rather than trapped behind a reversal nobody wanted.
 */
export const UNDO_WINDOW_MS = 6_000;

/** What one next-episodes card renders and presses. */
export interface UpNextMark {
  /**
   * The episode a press would record, or `null` when this card's run is spent — either
   * because the show has no released episode left (`finished`) or because the queue's cap
   * was reached (`UpNextQueue`'s own table).
   */
  readonly episode: QueuedEpisode | null;
  /**
   * Nothing released is left on this title.
   *
   * **It is not on its own the question *does this card leave the rail*** — `stillOnRail`
   * below is, and it adds the one branch this flag cannot carry: an entry that arrived
   * with an empty run was never markable and stays regardless.
   *
   * Distinct from `episode === null`, and the distinction is `UpNextQueue.more`. A card
   * that has merely run out of *queue* is still a show with episodes to watch, and
   * removing it would be the surface claiming a show finished because a constant is four.
   */
  readonly finished: boolean;
  /** A write against the episode above is on the wire — the control must not be pressed
   *  again while it is. */
  readonly pending: boolean;
  /** The episode this card has just recorded, while the reversal is still offered.
   *  `null` the moment the window closes, the reader marks again, or the write is rolled
   *  back — a failed mark has nothing to undo. */
  readonly undoable: QueuedEpisode | null;
  /** The just-marked episode's animation phase, so the slot can play the sweep once. */
  readonly phase: WatchMarkPhase;
  /**
   * The episode the card is holding on — the one just recorded, while its mark is still
   * `marking` — or `null`. The card draws this episode, washed, instead of `episode`
   * until the hold ends (`up-next-card.tsx`'s `HOLD_MS`), and `settle()` is what ends it.
   */
  readonly held: QueuedEpisode | null;
  /** What goes in the card's frame — `cardPicture`'s answer. The card renders it and does
   *  not choose it (#269), and does not choose the frame's own ratio either — `2/3` on the
   *  row since #320, `16/9` on the retired next-episodes card. */
  readonly picture: CardPicture;
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
const UNWATCHED: WatchMarkView = {
  watched: false,
  watches: 0,
  phase: "unwatched",
  pending: false,
};

/**
 * Where a card stands in its own run: how far along it is, whether that episode's write is
 * on the wire, and what the episode behind it is doing.
 *
 * The three travel together everywhere and are read together in one pass over the store,
 * so they are one type rather than three returns.
 */
interface Position {
  /** How many of this run's episodes the store calls watched — so, the index of the one
   *  the card is showing. Equal to the run's length once it is spent. */
  readonly position: number;
  readonly pending: boolean;
  /** The **just-marked** episode's phase, which is the one the sweep plays over. */
  readonly phase: WatchMarkPhase;
}

/**
 * Read the store once and answer all three — the only place any of them is derived.
 *
 * The walk stops at the first episode the store does not call watched, which is this
 * module's whole rule (see the docblock at the top of the file). Everything else in this
 * file, React or not, is a caller of this.
 */
function positionOf(
  marks: WatchMarks,
  libraryEntryId: string,
  queue: UpNextQueue,
): Position {
  let position = 0;
  while (position < queue.episodes.length) {
    const view = marks.read(subjectOf(libraryEntryId, queue.episodes[position]));
    if (!view?.watched) break;
    position += 1;
  }

  const current = queue.episodes[position] ?? null;
  const marked = position > 0 ? queue.episodes[position - 1] : null;

  return {
    position,
    pending:
      current === null
        ? false
        : (marks.read(subjectOf(libraryEntryId, current))?.pending ?? false),
    phase:
      marked === null
        ? "unwatched"
        : (marks.read(subjectOf(libraryEntryId, marked))?.phase ?? "settled"),
  };
}

/**
 * The same `Position`, as one string — **for `useSyncExternalStore` and nothing else.**
 *
 * That hook compares snapshots with `Object.is`, so a snapshot must be either a stable
 * object identity or a primitive. `positionOf` builds a fresh object per call and there is
 * no object in the store carrying all three fields to hand back instead, so returning it
 * directly would re-render for ever. Serialising it is what makes the comparison a value
 * comparison.
 *
 * `decode` is its exact inverse and the hook is its only caller: nothing outside the
 * subscription ever goes through the string, and `readUpNextMark` below reaches
 * `positionOf` directly.
 */
function encode(marks: WatchMarks, libraryEntryId: string, queue: UpNextQueue): string {
  const { position, pending, phase } = positionOf(marks, libraryEntryId, queue);
  return `${position}|${pending ? "1" : "0"}|${phase}`;
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
 * What a card shows, with no React in it — issue #220.
 *
 * The hook below is this plus a subscription and the *Undo* window; every rule about
 * *which episode is this card on* and *is it still on the rail* is here, where
 * `tests/up-next-card-mark.test.ts` drives it against a fake writer and a real store. That
 * split is the same one `watch-marks.ts` and `use-watch-mark.ts` already draw, and for the
 * same reason: this suite has no DOM, deliberately, so behaviour that only exists inside a
 * hook is behaviour nothing can assert.
 */
export interface UpNextMarkReading {
  /** The episode a press would record, or `null` when the run is spent. */
  readonly episode: QueuedEpisode | null;
  /** The episode a press has already recorded — what *Undo* would reverse. */
  readonly marked: QueuedEpisode | null;
  /** Nothing released is left. `stillOnRail` is what turns this into *leaves the rail*. */
  readonly finished: boolean;
  readonly pending: boolean;
  readonly phase: WatchMarkPhase;
}

export function readUpNextMark(
  marks: WatchMarks,
  libraryEntryId: string,
  queue: UpNextQueue,
): UpNextMarkReading {
  const { position, pending, phase } = positionOf(marks, libraryEntryId, queue);
  return {
    episode: queue.episodes[position] ?? null,
    marked: position > 0 ? queue.episodes[position - 1] : null,
    finished: position >= queue.episodes.length && !queue.more,
    pending,
    phase,
  };
}

/**
 * The picture a next-episodes surface draws — issue #269, narrowed by issue #320, and the
 * rule lives here rather than in the component for the reason everything else in this half
 * does: *which picture* is a derivation this module owns and
 * `tests/up-next-card-mark.test.ts` drives with no DOM.
 *
 * ── The episode's still is retired from this rule — issue #320 ──────────────────────
 *
 * Until #320 this preferred the head-of-run episode's own still over the title's poster,
 * and the Up next row cropped whichever it got into a `16:9` box — a wide frame squeezed
 * into a small one, which reads as a poster that has been cut off. Retiring the still *is*
 * the poster morph's own repair: opening a title from that row pairs this picture against
 * the title's own poster, and a still paired against a poster is two different pictures at
 * two different shapes travelling as though they were one thing. So the two are one change
 * (amended in the same pull request), not a box fixed here and a source
 * fixed separately.
 *
 * The mirrored `still_path` (#246) is untouched in the data and still drawn by the episode
 * page that owns it (`episode-still.tsx`). The compact row never reads it. `"still"` is
 * `featuredPicture`'s below — issue #362's featured card is wide, so a still fits its frame
 * rather than being squeezed into a poster's.
 *
 * ── What is left: the poster, or nothing ─────────────────────────────────────────────
 *
 * `none` is not a fallback but the absence of one: the frame keeps its space and nothing
 * goes in it, which is the rule for missing artwork, unchanged by this ticket.
 */
export type CardPicture =
  | { readonly kind: "still"; readonly path: string }
  | { readonly kind: "poster"; readonly path: string }
  | { readonly kind: "none" };

/**
 * What a next-episodes surface puts in its frame — issue #269, and issue #320's own
 * simplification of it.
 *
 * ── Why this no longer takes a position, or the marks store at all ──────────────────
 *
 * Before #320, the picture answered *which episode is this card on* — the head-of-run
 * episode's still while nothing had been marked, the title's poster once a mark advanced
 * past it, because `QueuedEpisode` carries no artwork of its own and a stale still from the
 * episode just watched would be a **wrong** picture rather than a missing one. That answer
 * needed the store: `positionOf` read it to say which episode, and the picture walked
 * forward on a mark and back on a rollback by the same rule the episode did.
 *
 * The still is gone from this rule now, and with it the one thing that ever depended on
 * position — the title's poster does not change as the mark advances, so there is nothing
 * left for a position to choose between. What is left is the entry's own fact, read once
 * and never revisited: does this title have a poster.
 */
export function cardPicture(entry: Pick<UpNextEntry, "posterPath">): CardPicture {
  if (entry.posterPath !== null) return { kind: "poster", path: entry.posterPath };
  return { kind: "none" };
}

/**
 * What the featured card puts in its frame — issue #362: the still of the episode it is
 * showing, then the title's poster, then nothing. The card is wide, so the still is the
 * natural picture; the poster stands in where TMDB has no still, rather than a blank frame.
 *
 * `shown` is the episode on the card — it moves with the mark, so the still does too.
 * `null` is a card whose run arrived empty, which falls back to the head episode's still.
 */
export function featuredPicture(
  entry: Pick<UpNextEntry, "posterPath" | "stillPath">,
  shown: QueuedEpisode | null,
): CardPicture {
  const still = shown === null ? entry.stillPath : shown.stillPath;
  if (still !== null) return { kind: "still", path: still };
  return cardPicture(entry);
}

/** Watched against aired, in the shape `PosterProgressBar` takes. */
export interface SeasonProgress {
  readonly watched: number;
  readonly released: number;
}

/**
 * How far through its season the episode on the card is — issue #364's bar.
 *
 * `marked` is how many of the run the store calls watched (the card's position), and
 * `shown` is the episode on the card: the one being held, or the next to watch. Derived
 * from the position like everything else here, so the bar advances on a mark, walks back
 * on Undo and on a rollback, and can never disagree with the episode beside it.
 *
 * The read's baseline belongs to the Up next episode's season only; a later season the run
 * crosses into has no watch before the Up next episode (`UpNextEntry.seasonWatched`), so
 * there it counts only what this card has marked. `shown === null` is the arrived-empty
 * card, which shows the read's own answer.
 */
export function seasonProgress(
  entry: Pick<UpNextEntry, "seasonNo" | "seasonWatched" | "seasonReleased" | "queue">,
  shown: QueuedEpisode | null,
  marked: number,
): SeasonProgress {
  if (shown === null) {
    return { watched: entry.seasonWatched, released: entry.seasonReleased };
  }
  const baseline = shown.seasonNo === entry.seasonNo ? entry.seasonWatched : 0;
  const markedHere = entry.queue.episodes
    .slice(0, marked)
    .filter((one) => one.seasonNo === shown.seasonNo).length;
  return {
    watched: Math.min(baseline + markedHere, shown.seasonReleased),
    released: shown.seasonReleased,
  };
}

/**
 * Whether this card still belongs on the next-episodes rail — the rule, written once.
 *
 * `up-next-episode-rail.tsx` asks it of every entry so that a rail whose last card has
 * been marked away takes its heading with it, and `up-next-episode-card.tsx` asks it of
 * itself so that the card stops rendering. Two callers, one rule: a rail that disagreed
 * with its own cards would leave a heading over an empty track, which *an
 * empty rail is absent* forbids as surely as a count would.
 *
 * ── The arrived-empty branch, and why it is not `finished` (#250) ────────────────────
 *
 * An entry handed an empty run by the server was never markable, so nothing the reader
 * does can finish it, and it stays. Coming back's entries used to be the common case;
 * they are off Continue watching now, and what is left is `listUpNextRails`' defensive
 * `more: true` fallback. An entry handed a non-empty run leaves when that run is spent.
 *
 * ── It leaves after the hold, not at the press ───────────────────────────────────────
 *
 * Marking a show's last aired episode spends its run at once, but the card holds on that
 * episode, washed, with *Undo* beside it (`HOLD_MS`). So a spent card stays while its
 * last mark is still `marking`, and leaves the moment `settle()` ends the hold.
 */
export function stillOnRail(
  marks: WatchMarks,
  libraryEntryId: string,
  queue: UpNextQueue,
): boolean {
  if (queue.episodes.length === 0) return true;
  const reading = readUpNextMark(marks, libraryEntryId, queue);
  return !reading.finished || reading.phase === "marking";
}

/** Record a watch of `episode` from a card. The key, the rollback and the toast are all
 *  `watch-marks.ts`'s — this only chooses the subject and the naming. */
export function markFromCard(
  marks: WatchMarks,
  entry: Pick<UpNextEntry, "libraryEntryId" | "titleName">,
  episode: QueuedEpisode,
): Promise<void> {
  return holdOverWhile(
    marks.mark(subjectOf(entry.libraryEntryId, episode), namingFor(entry.titleName, episode)),
  );
}

/** Take one back — the same store's `unwatch`, which removes every watch of that episode
 *  (#145) and raises its own toast, without a *Try again*, if the delete is lost. */
export function undoFromCard(
  marks: WatchMarks,
  entry: Pick<UpNextEntry, "libraryEntryId" | "titleName">,
  episode: QueuedEpisode,
): Promise<void> {
  /* `undo`, not `unwatch`. This offers to take back the mark the reader just pressed, and
     `unwatch` removes **every** watch of the episode — so on one of the 1,156 episodes
     carrying imported rewatches this was quietly deleting years of
     history while claiming to reverse one press. `db/access.ts`'s `undoWatch` is the
     inverse of the mark, and nothing else. */
  return holdOverWhile(
    marks.undo(subjectOf(entry.libraryEntryId, episode), namingFor(entry.titleName, episode)),
  );
}

/**
 * Subscribe to every episode in a run, as one subscription.
 *
 * `watch-marks.ts` subscribes per episode, so this is the composition of those — and the
 * unsubscribes are collected in order and run in order, because a listener left attached
 * to an episode a card no longer shows is a re-render nobody asked for.
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
 * One next-episodes card's mark — issue #220.
 *
 * `marks` is injectable for the reason every store in this build is: `watch-marks.ts` takes
 * its writer, its failure store and its key minter as arguments precisely so the behaviour
 * can be exercised without a browser, and a hook that reached for the module-level instance
 * would put this half of the behaviour out of that reach.
 */
export function useUpNextMark(
  entry: UpNextEntry,
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
   * render, so what the card draws and what it re-rendered for are the same answer.
   * `decode` is `encode`'s inverse and `readUpNextMark` composes both — the memo is what
   * keeps the objects stable between renders that changed nothing.
   */
  const { position, pending, phase } = useMemo(() => decode(snapshot), [snapshot]);

  /**
   * The episode this card last pressed, and the only piece of state that is *this card's*
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
   * Offered only while the episode behind the card's position is the one this card
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
    held: phase === "marking" ? marked : null,
    /** The entry's own poster, since #320 — no longer a function of the position, because
     *  there is no still left in this rule for the position to choose between. */
    picture: cardPicture(entry),
    mark() {
      if (episode === null) return;
      setPressed(episode.episodeId);
      void markFromCard(marks, entry, episode);
    },
    undo() {
      if (undoable === null) return;
      setPressed(null);
      void undoFromCard(marks, entry, undoable);
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
 * The next-episodes rail's surviving cards — issue #220, widened to the whole rail by
 * #250.
 *
 * Held by the rail rather than by the cards so that a rail whose every card has been
 * marked away renders nothing at all: an empty rail is absent, and a client-side emptying
 * has to reach the same answer. The rule is `stillOnRail` above, asked once per entry, so
 * this and the card cannot disagree about which cards are gone.
 *
 * **The nothing-at-all state is not re-derived here.** `up-next-rails.tsx` decides the
 * screen's own sentence from two reads that succeeded, on the server, and a library
 * emptied card by card between two loads keeps an absent rail and no sentence until the
 * next one. That is a stale empty state rather than a wrong one — the rail it would speak
 * for is already absent — and reconstructing it in the browser would mean the phrase that
 * must never stand in for a failed read (`AGENTS.md`) having a second author.
 */
export function useEntriesOnRail(
  entries: readonly UpNextEntry[],
  marks: WatchMarks = watchMarks,
): readonly UpNextEntry[] {
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
        .filter((entry) => stillOnRail(marks, entry.libraryEntryId, entry.queue))
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
