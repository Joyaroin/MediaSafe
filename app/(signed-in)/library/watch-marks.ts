"use client";

import { referenceFor } from "@/errors/reference";
import {
  writeFailures,
  type LostWrite,
  type WriteFailureHandle,
  type WriteFailureStore,
} from "@/errors/write-failure";
import {
  recordWatchAction,
  undoWatchAction,
  type UndoActionOutcome,
  type WatchActionOutcome,
} from "./watch-action";

/**
 * Every watch mark on screen, keyed by the episode it is about — with no React in it.
 *
 * The directive above is the same safety boundary `errors/write-failure.ts` draws, for
 * the same reason: `watchMarks` at the bottom of this file is one module-level object,
 * and module state on the server is shared by every request and so by every account. One
 * person's outstanding write becoming another person's struck row is not a mistake this
 * product can survive (`CONTEXT.md`), and `"use client"` turns it into a build-time
 * client-reference error rather than a silent leak.
 *
 * ── Why the state left the row — issue #103 ──────────────────────────────────────────
 *
 * Issue #88 put the optimistic state in `EpisodeLine`; #89 extracted it to
 * `use-watch-mark.ts` so four callers could drive one write. In both, the state belonged
 * to **a component instance**. On desktop that is now wrong: `library-surface.tsx`
 * renders the TONIGHT row (#100) above the bill and the programme note (#58) beside it,
 * **at the same time**, and both can be showing the same episode. Two instances meant two
 * optimistic states, two idempotency keys, and two keys against one episode are two rows.
 *
 * A phantom rewatch does not look like a bug on any screen. 1,156 genuine rewatches are
 * already in the library (`docs/adr/0001-watch-identity-and-derived-state.md`, amendment
 * 4), so an extra row looks exactly like something the reader did.
 *
 * So the unit of state is **the episode**, not the surface showing it:
 *
 * ```
 * TONIGHT card   ─┐
 *                 ├─▶ one mark ─▶ one key ─▶ one row
 * programme note ─┘
 * ```
 *
 * ── The key names the write, not the press ───────────────────────────────────────────
 *
 * Unchanged from #89, and now true across surfaces rather than only across one row's two
 * controls: minted when **nothing is outstanding for that episode**, reused by every
 * route back to that same write — either surface's control and the toast's *Try again* —
 * and cleared only once one of them has actually landed. A press on the second surface
 * while the first is in flight is therefore a **retry**, not a rewatch. A deliberate
 * rewatch, made after the previous write settled, still mints a new key, because by then
 * nothing is outstanding.
 *
 * ── Why the whole appearance is shared, not only the key ─────────────────────────────
 *
 * A shared key alone would still leave two surfaces disagreeing about what they show, and
 * three of #103's acceptance criteria are about exactly that: a failure raises **one**
 * toast rather than one per surface, retrying from that toast resolves **both**, and both
 * read as struck once the write lands without a reload. All three are properties of one
 * write, so the appearance, the in-flight flag and the raised toast live beside the key
 * here rather than being copied per instance and kept in step by hand.
 *
 * ── A mark is never released, and what a later surface does with its own seed ────────
 *
 * Records outlive the surfaces that created them, deliberately. A toast's *Try again*
 * closure can be pressed after every surface showing that episode is gone, and a record
 * dropped underneath it would mint a fresh key — the precise bug this file exists to
 * close. The cost is a few dozen bytes per episode ever shown, and a page load clears all
 * of it.
 *
 * That leaves one question with two wrong answers: a surface mounting later arrives with
 * its own seed, read from the server, and the mark already has an appearance. Always
 * adopting the mark would let a **written** one go stale — nothing in this app reloads on
 * navigation, so a bulk import (`/import`, one client-side navigation away from the
 * library via settings) can add watches this store never saw. Always taking the newer seed
 * would un-strike an episode the reader has just marked, on any surface whose props were
 * read before that press — which is a landed write reading as a lost one.
 *
 * So the split is by whether **this store has ever written to that episode**. It has not:
 * the mark holds nothing a fresh server read does not already know, and the newer seed
 * wins. It has: the store is the only thing that knows, and the mark wins — including
 * while a write is still in flight, which no server read can see at all.
 */

export type WatchMarkPhase = "unwatched" | "marking" | "settled";

/**
 * Everything about one episode that a press changes, in one object.
 *
 * They are one piece of state and not three because every write here sets all three at
 * once and a failure puts all three back — and *back* has to mean the appearance the
 * episode had at the moment of that press, captured then rather than reconstructed later.
 * Three fields updated separately would make the rollback three statements that can drift
 * out of step, and two of the three are only ever wrong in ways nothing on screen would
 * show.
 */
export interface WatchAppearance {
  /** Struck, in the reader's eye. Flips before the server has answered. */
  readonly watched: boolean;
  /** Whether there is an app watch to take back — `db/access.ts`'s `EpisodeDetail`. */
  readonly undoable: boolean;
  readonly phase: WatchMarkPhase;
}

/**
 * What a surface renders. `pending` is a fact about the write rather than about the
 * appearance, which is why it sits outside `WatchAppearance` and is not part of what a
 * rollback puts back — and sharing it is the point: while this episode's write is on the
 * wire, *every* surface showing it has a control that must not be pressed again.
 */
export interface WatchMarkView extends WatchAppearance {
  readonly pending: boolean;
}

/**
 * Which episode — or which film — a mark is about. The same two fields `db/access.ts`
 * identifies a watch by, and deliberately no third.
 */
export interface WatchSubject {
  readonly libraryEntryId: string;
  /** `null` for a film, exactly as `RecordWatchParams` already allows. */
  readonly episodeId: string | null;
}

/**
 * What the toast prints if this write is lost, taken straight off `LostWrite` rather than
 * respelled — there is one vocabulary for naming a lost write and it lives there.
 */
export type WatchNaming = Pick<LostWrite, "title" | "episode">;

/**
 * The two writes, behind an interface, so `tests/watch-marks.test.ts` can drive every
 * route back to one write without a server, a session or a database. The shapes are
 * `watch-action.ts`'s own outcomes rather than a parallel set: a fake that could answer
 * something the real caller cannot return would be a test of the fake.
 */
export interface WatchWriter {
  record(params: {
    readonly libraryEntryId: string;
    readonly episodeId: string | null;
    readonly sourceKey: string;
  }): Promise<WatchActionOutcome>;
  remove(params: {
    readonly libraryEntryId: string;
    readonly episodeId: string | null;
  }): Promise<UndoActionOutcome>;
}

export interface WatchMarks {
  /**
   * Attach a surface. `initial` seeds the mark if this is the first surface to show this
   * episode, and replaces it if no write has been made against it since — but never once
   * one has (see the docblock above).
   */
  subscribe(
    subject: WatchSubject,
    initial: WatchMarkView,
    onChange: () => void,
  ): () => void;
  /** This episode's shared view, or `null` if no surface has ever shown it. */
  read(subject: WatchSubject): WatchMarkView | null;
  /** Record a watch — or join the one already outstanding for this episode. */
  mark(
    subject: WatchSubject,
    naming: WatchNaming,
    onRecorded?: () => void,
  ): Promise<void>;
  /** Take one watch back — issue #89. */
  undo(subject: WatchSubject, naming: WatchNaming): Promise<void>;
  /** The strike animation ended, on whichever surface got there first. */
  settle(subject: WatchSubject): void;
}

/** What a mark starts as when a write reaches an episode no surface is showing. */
const UNSEEN: WatchMarkView = {
  watched: false,
  undoable: false,
  phase: "unwatched",
  pending: false,
};

interface Mark {
  /**
   * Replaced, never mutated: `useSyncExternalStore` compares snapshots by identity, and a
   * `read()` that built a fresh object each call would re-render for ever.
   */
  view: WatchMarkView;
  /**
   * The idempotency key of the watch write that has not landed yet, or `null` when none
   * is outstanding. It names the **write**, not the press.
   */
  key: string | null;
  /** What a failure puts back — the appearance as of the press that started the write. */
  restore: WatchAppearance;
  /**
   * This episode's outstanding lost write, and **which of the two it was**.
   *
   * The kind is not bookkeeping. `resolve()` means *the write landed, or the reader no
   * longer needs to see this*, and a landed write only says that about a lost one of the
   * same kind. A mark that lands after a lost mark genuinely settles it — the episode is
   * watched, which is what the reader was trying to say. A **rewatch that lands after a
   * lost undo settles nothing**: the undo is still lost, and there is now one more watch
   * than the reader asked for. Resolving there would take the only notice of it off the
   * screen, which is `SPEC.md` §3.3 broken by a write that succeeded.
   */
  raised: { kind: "watch" | "undo"; handle: WriteFailureHandle } | null;
  /**
   * Whether this store has ever written to this episode. Not the same question as
   * *is something outstanding* — a write that landed leaves nothing outstanding and is
   * exactly the case a later surface's older seed must not overwrite.
   */
  written: boolean;
  listeners: Set<() => void>;
}

function appearanceOf(view: WatchMarkView): WatchAppearance {
  return { watched: view.watched, undoable: view.undoable, phase: view.phase };
}

function sameView(one: WatchMarkView, other: WatchMarkView): boolean {
  return (
    one.watched === other.watched &&
    one.undoable === other.undoable &&
    one.phase === other.phase &&
    one.pending === other.pending
  );
}

/**
 * `|` separates the two because a uuid contains neither one — so the film whose entry is
 * `e` and episode `e` of some other entry can never collide, without this having to know
 * anything about how ids are shaped.
 */
function idOf(subject: WatchSubject): string {
  return `${subject.libraryEntryId}|${subject.episodeId ?? "film"}`;
}

export function createWatchMarks({
  writer,
  failures = writeFailures,
  /** Injected so a test can read the sequence, exactly as the toast store's counter is. */
  mintKey = () => crypto.randomUUID(),
}: {
  readonly writer: WatchWriter;
  readonly failures?: WriteFailureStore;
  readonly mintKey?: () => string;
}): WatchMarks {
  const marks = new Map<string, Mark>();

  function ensure(subject: WatchSubject, initial: WatchMarkView): Mark {
    const id = idOf(subject);
    const existing = marks.get(id);
    if (existing) return existing;

    const fresh: Mark = {
      view: initial,
      key: null,
      restore: appearanceOf(initial),
      raised: null,
      written: false,
      listeners: new Set(),
    };
    marks.set(id, fresh);
    return fresh;
  }

  function apply(one: Mark, next: Partial<WatchMarkView>): void {
    one.view = { ...one.view, ...next };
    for (const listener of one.listeners) listener();
  }

  /** Take the toast down only if it was raised by a lost write of this same kind. */
  function settleToast(one: Mark, kind: "watch" | "undo"): void {
    if (one.raised?.kind !== kind) return;
    one.raised.handle.resolve();
    one.raised = null;
  }

  /**
   * The appearance a failure has to put back, captured on the attempt that **starts** a
   * write and never on one that joins a write already on the wire — at that second moment
   * the appearance is the optimistic one, and restoring it would leave an episode struck
   * with nothing behind it.
   */
  function holdRestore(one: Mark): void {
    if (one.view.pending) return;
    one.restore = appearanceOf(one.view);
  }

  async function mark(
    subject: WatchSubject,
    naming: WatchNaming,
    onRecorded?: () => void,
  ): Promise<void> {
    const one = ensure(subject, UNSEEN);
    one.written = true;

    // Minted when nothing is outstanding for this episode; reused by every other route
    // back to the same write, whichever surface that route is drawn on.
    one.key ??= mintKey();
    const sourceKey = one.key;

    holdRestore(one);
    apply(one, { watched: true, undoable: true, phase: "marking", pending: true });

    const outcome = await record(subject, sourceKey);

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing besides the reader that ever takes this toast down.
      one.key = null;
      apply(one, { pending: false });
      settleToast(one, "watch");
      // The surface that pressed is the one that hears back. Nothing else on screen has a
      // use for it: `FilmRow` patches its title's state, and it is the only caller that
      // passes this at all.
      onRecorded?.();
      return;
    }

    apply(one, { ...one.restore, pending: false });

    // One toast per lost write, not one per attempt — and now, not one per surface.
    if (one.raised) return;

    one.raised = {
      kind: "watch",
      handle: failures.raise({
        title: naming.title,
        episode: naming.episode,
        reference: outcome.reference,
        // The same key, through a third route back to the same write.
        retry: () => void mark(subject, naming, onRecorded),
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
   * sensible to retry*) and the episode goes back to being struck. Pressing undo again is
   * then a deliberate act against a row the reader can see.
   */
  async function undo(subject: WatchSubject, naming: WatchNaming): Promise<void> {
    const one = ensure(subject, UNSEEN);
    one.written = true;

    holdRestore(one);
    // The optimistic guess is *unwatched*, because it is right for every episode with one
    // app watch and nothing underneath — which is nearly all of them. Where it is wrong,
    // the outcome below says so and it is corrected rather than left standing.
    apply(one, { watched: false, undoable: false, phase: "unwatched", pending: true });

    const outcome = await removeWatch(subject);

    if (outcome.ok) {
      // What survived, from the table: an imported watch underneath, or the earlier half
      // of a rewatch, both of which leave this episode watched. `settled`, never
      // `marking` — nothing was recorded here, so nothing is stamped.
      apply(one, {
        watched: outcome.watched,
        undoable: outcome.undoable,
        phase: outcome.watched ? "settled" : "unwatched",
        pending: false,
      });
      settleToast(one, "undo");
      return;
    }

    apply(one, { ...one.restore, pending: false });

    if (one.raised) return;

    one.raised = {
      kind: "undo",
      handle: failures.raise({
        title: naming.title,
        episode: naming.episode,
        reference: outcome.reference,
      }),
    };
  }

  /**
   * The one failure `recordWatchAction` cannot report itself, turned into the same
   * outcome shape: the request never reaching the server at all.
   */
  async function record(
    subject: WatchSubject,
    sourceKey: string,
  ): Promise<WatchActionOutcome> {
    try {
      return await writer.record({ ...subject, sourceKey });
    } catch (error) {
      return { ok: false, reference: referenceFor(error, { surface: "record-watch" }) };
    }
  }

  /** The same wrapper as `record` above, around the delete. */
  async function removeWatch(subject: WatchSubject): Promise<UndoActionOutcome> {
    try {
      return await writer.remove(subject);
    } catch (error) {
      return { ok: false, reference: referenceFor(error, { surface: "undo-watch" }) };
    }
  }

  return {
    subscribe(subject, initial, onChange) {
      const one = ensure(subject, initial);
      // Listening before reseeding, so the surface that brought the newer read is told
      // about it like any other. `useSyncExternalStore` re-reads after subscribing and
      // would catch it either way; this does not make anyone depend on that.
      one.listeners.add(onChange);
      // The newer server read wins over a mark nothing has written to — and only over
      // that one. `restore` moves with it: what a failure puts back is what the episode
      // looked like before the press, and that is now this.
      if (!one.written && !sameView(one.view, initial)) {
        one.restore = appearanceOf(initial);
        apply(one, initial);
      }
      return () => {
        one.listeners.delete(onChange);
      };
    },

    read(subject) {
      return marks.get(idOf(subject))?.view ?? null;
    },

    mark,
    undo,

    settle(subject) {
      const one = marks.get(idOf(subject));
      // Guarded, so it cannot re-settle an episode a failure has already put back to
      // `unwatched`, and so the second surface's animation ending is a no-op rather than
      // a second transition.
      if (!one || one.view.phase !== "marking") return;
      apply(one, { phase: "settled" });
    },
  };
}

/**
 * The app's one store, over the two Server Actions. A module-level instance rather than a
 * React context for a reason the toast store's own docblock only half covers: the surfaces
 * that share a mark sit in different branches of the tree — `up-next-row.tsx` above the
 * bill, `programme-note.tsx` beside it — so a provider wrapping both would have to be
 * mounted by a component with no other reason to know either of them exists.
 */
export const watchMarks = createWatchMarks({
  writer: {
    record: (params) => recordWatchAction(params),
    remove: (params) => undoWatchAction(params),
  },
});
