"use client";

import { referenceFor } from "@/errors/reference";
import {
  writeFailures,
  type LostWrite,
  type WriteFailureHandle,
  type WriteFailureStore,
} from "@/errors/write-failure";
import {
  markWatchedUpToAction,
  recordWatchAction,
  undoWatchAction,
  unwatchAction,
  type MarkWatchedUpToActionOutcome,
  type UnwatchActionOutcome,
  type WatchActionOutcome,
} from "./watch-action";

/**
 * Every watch mark on screen, keyed by the episode it is about — with no React in it.
 *
 * The directive above is the same safety boundary `errors/write-failure.ts` draws, for
 * the same reason: `watchMarks` at the bottom of this file is one module-level object,
 * and module state on the server is shared by every request and so by every account. One
 * person's outstanding write becoming another person's struck row is not a mistake this
 * product can survive, and `"use client"` turns it into a build-time
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
 * already in the library (amendment
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
 * ── The TONIGHT card is gone; the unit of state is not ────────────────────────────────
 *
 * Issue #136 deleted the desktop TONIGHT row this section names — Up next moved to its
 * own page, and the library surface it used to sit above no longer renders any per-episode
 * mark beside the programme note's. Nothing here changed with it. The unit of state was
 * never *this pairing specifically*; it was *the episode*, precisely so that whichever
 * surfaces happen to show one at once — today, or after some future surface reintroduces
 * a second one — agree by construction rather than by every caller remembering to check.
 * Keying by component instance was the mistake #103 fixed; reverting to it because one of
 * two callers left would be re-opening a bug for a component that is not there to trigger
 * it yet, on the promise that nothing else ever will be.
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
 * They are one piece of state and not two because every write here sets both at once and
 * a failure puts both back — and *back* has to mean the appearance the episode had at the
 * moment of that press, captured then rather than reconstructed later. Fields updated
 * separately would make the rollback two statements that can drift out of step.
 *
 * There were three until #145. `unwatchable` said whether there was an app watch to take
 * back, because an episode whose watches were all imported offered no unwatch; unwatch
 * now removes every watch of an episode whatever recorded it, so the answer was always
 * `watched` and the field went with the rule.
 */
export interface WatchAppearance {
  /** Struck, in the reader's eye. Flips before the server has answered. */
  readonly watched: boolean;
  /**
   * How many watches this episode has, in the same eye. `watched` is `watches > 0`, and
   * the two are always applied together — no path in this file sets one without the other,
   * which is what keeps them from becoming the disagreement `EpisodeDetail` warns about.
   *
   * It is held here rather than left to the server read because the season row prints it,
   * and a `×2` that appeared one revalidation after the press would be the only part of a
   * mark that was not optimistic.
   */
  readonly watches: number;
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
  }): Promise<UnwatchActionOutcome>;
  /** Takes back the newest watch only. A different write from `remove`, not a flag on it
   *  — `db/access.ts`'s `undoWatch` has why. */
  undo(params: {
    readonly libraryEntryId: string;
    readonly episodeId: string | null;
  }): Promise<UnwatchActionOutcome>;
  /**
   * *Watched up to here* — issue #196. One press, one key, one transaction, and the set
   * derived server-side from the episode named here: `markWatchedUpToAction`'s own
   * docblock says why the browser does not send a list of ids.
   */
  recordUpTo(params: {
    readonly libraryEntryId: string;
    readonly upToEpisodeId: string;
    readonly sourceKey: string;
  }): Promise<MarkWatchedUpToActionOutcome>;
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
  unwatch(subject: WatchSubject, naming: WatchNaming): Promise<void>;
  /**
   * *I did not mean to press that.* Removes the newest watch and puts the appearance back
   * to whatever it was before the mark this is undoing — which is **not** always
   * unwatched: undo a rewatch and the episode is still watched, because it still is.
   */
  undo(subject: WatchSubject, naming: WatchNaming): Promise<void>;
  /**
   * Record everything up to and including one episode — issue #196.
   *
   * `covered` is what the row that pressed worked out is about to be written
   * (`mark-up-to.ts`), and is what this marks on screen; `through` is the only thing
   * that travels, and the server derives the set again from it. The two can disagree if
   * the reader's page is older than the table, and the disagreement is harmless in the
   * one direction it can go: every covered episode carries a watch once this lands,
   * whichever press was the one to write it.
   */
  markUpTo(
    through: WatchSubject,
    covered: readonly WatchSubject[],
    naming: WatchNaming,
  ): Promise<void>;
  /** The strike animation ended, on whichever surface got there first. */
  settle(subject: WatchSubject): void;
}

/** What a mark starts as when a write reaches an episode no surface is showing. */
const UNSEEN: WatchMarkView = {
  watched: false,
  watches: 0,
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
   * lost unwatch settles nothing**: the unwatch is still lost, and there is now one more
   * watch than the reader asked for. Resolving there would take the only notice of it off
   * the screen, which is *never silent* broken by a write that succeeded.
   */
  raised: { kind: "watch" | "unwatch"; handle: WriteFailureHandle } | null;
  /**
   * Whether this store has ever written to this episode. Not the same question as
   * *is something outstanding* — a write that landed leaves nothing outstanding and is
   * exactly the case a later surface's older seed must not overwrite.
   */
  written: boolean;
  /**
   * How many of **this episode's own** writes are on the wire right now — issue #196.
   *
   * Not the same question as `key !== null`, which is the one this was written as first
   * and got wrong: a key outlives a *failed* attempt deliberately, so that the toast's
   * *Try again* is a retry rather than a second write. An episode whose mark failed an
   * hour ago therefore still has a key and nothing in flight, and a bulk press that read
   * the key as busy would hand the row back permanently disabled.
   *
   * A count and not a flag, because two routes back to one write can be outstanding at
   * once (`mark`'s own docblock): the first to answer must not report the episode idle
   * while the second is still out.
   */
  inFlight: number;
  listeners: Set<() => void>;
}

function appearanceOf(view: WatchMarkView): WatchAppearance {
  return { watched: view.watched, watches: view.watches, phase: view.phase };
}

function sameView(one: WatchMarkView, other: WatchMarkView): boolean {
  return (
    one.watched === other.watched &&
    one.watches === other.watches &&
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
  /**
   * The outstanding *watched up to here* press against each episode it was pressed on —
   * issue #196, and a second map rather than two more fields on `Mark` because the press
   * is not a fact about the episode it names. `markUpTo`'s docblock carries the
   * argument; the shape is the two fields a `Mark` holds for its own write, minus the
   * appearance, which the covered episodes hold individually.
   */
  const upToWrites = new Map<
    string,
    { key: string | null; raised: WriteFailureHandle | null }
  >();

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
      inFlight: 0,
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
  function settleToast(one: Mark, kind: "watch" | "unwatch"): void {
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
    /* `+ 1`, which is what makes this a **rewatch** when the episode already had one:
       the same call, the same key discipline, one more row. The row's `×N` follows from
       here rather than waiting for a revalidation. */
    apply(one, {
      watched: true,
      watches: one.view.watches + 1,
      phase: "marking",
      pending: true,
    });

    one.inFlight += 1;
    const outcome = await record(subject, sourceKey);
    // Decremented before every branch below, including the early return: this attempt is
    // answered whatever the answer turns out to be about.
    one.inFlight -= 1;

    // ── An attempt only ever speaks for the write it named ────────────────────────────
    //
    // Two routes back to one write can be pressed in quick succession — after a failure
    // the toast's *Try again* and both surfaces' controls are live at the same time — and
    // then two requests carry this one key. The key is cleared *nowhere* but the success
    // below, so finding it moved on means this attempt's own write has already landed.
    //
    // Without this the second answer would be read as news. A failure arriving after the
    // write succeeded would put a struck episode back to unwatched and raise a toast whose
    // *Try again* mints a fresh key — nothing being outstanding by then — and that is a
    // second row against an episode that already has one. The phantom rewatch, through the
    // one door left open.
    if (one.key !== sourceKey) return;

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing besides the reader that ever takes this toast down.
      one.key = null;
      // Read off the outcome, not off what the press optimistically set: a *concurrent*
      // attempt's failure can have rolled the appearance back while this one was still on
      // the wire, and inheriting that would leave an episode reading unwatched with a
      // landed write behind it. The phase is the exception — it is the animation's, and
      // only an appearance that was actually put back has a strike left to play.
      apply(one, {
        watched: true,
        /* `Math.max(1, …)`, not `+ 1`: the press above already counted this write, and a
           concurrent failure's rollback is the only thing that could have taken the count
           back below one while this attempt was on the wire. Adding again here would
           double-count the one row this attempt wrote. */
        watches: Math.max(1, one.view.watches),
        phase: one.view.phase === "unwatched" ? "marking" : one.view.phase,
        pending: false,
      });
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
   * Unwatch an episode — issue #89, and every watch of it since #145.
   *
   * ── The optimistic guess is now simply right ──────────────────────────────────────
   *
   * #89 guessed *unwatched* and then corrected itself from the outcome, because the guess
   * was wrong wherever an imported watch or the earlier half of a rewatch was underneath
   * — neither of which a browser can see. Both are removed now, so a landed unwatch
   * always leaves the episode unwatched and there is nothing left to correct. What
   * follows a success is `pending: false` and the truth restated, not news.
   *
   * ── Why this one is still not offered a retry ─────────────────────────────────────
   *
   * The reason #89 gave has expired and is worth saying so: it was that a lost *delete*
   * carries no idempotency key, so re-sending one could remove a *second* watch — the
   * earlier half of a rewatch, gone silently. That cannot happen any more. This delete is
   * over a predicate rather than a row, so sending it twice removes exactly what sending
   * it once removes.
   *
   * The conclusion survives on a different footing. "The response never arrived" and "the
   * delete never happened" are still the same event from here, and the reader may well
   * have re-watched the episode in between — a *Try again* pressed against a stale toast
   * would then remove a watch they meant to keep, with nothing on screen to say so. So
   * the toast is raised without a `retry` (`errors/write-failure.ts` allows exactly this:
   * *absent when there is nothing sensible to retry*) and the episode goes back to being
   * struck. Pressing unwatch again is then a deliberate act against a row the reader can
   * see.
   */
  async function unwatch(subject: WatchSubject, naming: WatchNaming): Promise<void> {
    const one = ensure(subject, UNSEEN);
    one.written = true;

    holdRestore(one);
    apply(one, { watched: false, watches: 0, phase: "unwatched", pending: true });

    one.inFlight += 1;
    const outcome = await removeWatch(subject);
    one.inFlight -= 1;

    if (outcome.ok) {
      // Restated from the write that landed rather than left as the press set it: a
      // *concurrent* attempt's failure can have rolled the appearance back to struck
      // while this one was still on the wire, and inheriting that would leave an episode
      // reading watched with no watch behind it — the mirror of the case `mark` above
      // guards. `unwatched`, never `settled`: nothing was recorded, so nothing is
      // stamped and there is no strike to play out.
      apply(one, { watched: false, watches: 0, phase: "unwatched", pending: false });
      settleToast(one, "unwatch");
      return;
    }

    apply(one, { ...one.restore, pending: false });

    if (one.raised) return;

    one.raised = {
      kind: "unwatch",
      handle: failures.raise({
        title: naming.title,
        episode: naming.episode,
        reference: outcome.reference,
      }),
    };
  }

  /**
   * *Undo* — the fourth write, and the one that used to be `unwatch` wearing a different
   * label.
   *
   * ── What it puts on screen, and why that is not always *unwatched* ─────────────────
   *
   * `one.restore` — the appearance `holdRestore` captured when the mark being undone
   * started. That is the whole trick, and it is why this reads nothing new off the server:
   * undoing a mark on a previously unwatched episode lands on unwatched, and undoing a
   * **rewatch** lands back on watched, because the episode still is. The store has no idea
   * how many watch rows an episode has and does not need one; it knows what the screen
   * said a moment before the press.
   *
   * ── No retry, and here the reason is sharper than `unwatch`'s ──────────────────────
   *
   * `unwatch`'s docblock notes that its delete is over a **predicate**, so sending it
   * twice removes exactly what sending it once removes. **That is not true of this one.**
   * This delete is over a row chosen at the moment it runs, so a second send removes a
   * second watch — the earlier half of a rewatch, gone silently, which is the exact
   * failure `undoWatch` was written to stop. A *Try again* on a lost undo would be the
   * bug reintroduced through the recovery path, so there is none.
   */
  async function undo(subject: WatchSubject, naming: WatchNaming): Promise<void> {
    const one = ensure(subject, UNSEEN);
    one.written = true;

    const before = one.restore;
    apply(one, { ...before, pending: true });

    one.inFlight += 1;
    const outcome = await undoWrite(subject);
    one.inFlight -= 1;

    if (outcome.ok) {
      apply(one, { ...before, pending: false });
      settleToast(one, "unwatch");
      return;
    }

    /* The mark is still there, so the screen says so again. `settled` and not `marking`:
       there is no sweep to replay for a watch that was recorded a while ago. */
    apply(one, {
      watched: true,
      // The write did not land, so the row it was taking back is still there — one more
      // than the appearance this undo optimistically restored.
      watches: before.watches + 1,
      phase: "settled",
      pending: false,
    });

    if (one.raised) return;

    one.raised = {
      kind: "unwatch",
      handle: failures.raise({
        title: naming.title,
        episode: naming.episode,
        reference: outcome.reference,
      }),
    };
  }

  /**
   * *Watched up to here* — issue #196, and the third write this store owns.
   *
   * ── Why it belongs here and not in the row that draws the control ────────────────
   *
   * It writes the same rows the per-episode mark writes, so it has to move the same
   * marks: a press on episode ten leaves nine other rows on screen that are now watched,
   * and every one of them may also be showing on another surface (this file's top
   * docblock). Held anywhere else, the two would disagree — a row would read unwatched
   * with a landed write behind it, which is the case this store exists to make
   * unreachable.
   *
   * ── One key, and its own map ─────────────────────────────────────────────────────
   *
   * The key names the press and is reused by the toast's *Try again*, exactly as `mark`'s
   * is. It is **not** kept on any episode's `Mark`, because it is not any episode's: the
   * pressed row may not even be in the set (a gap behind a watched row is the case), and
   * an episode carrying two writes' keys in one field is two writes that would take each
   * other's toast down. `upToWrites` is that separate home, keyed by the episode
   * pressed.
   *
   * ── Rows arrive settled, and nothing sweeps ──────────────────────────────────────
   *
   * The phase goes straight to `settled` rather than through `marking`. The sweep marks
   * *the event of recording one watch*; sixty-two of them would dramatise a migration as
   * an evening's viewing (issue #196), and the rows are history rather than something
   * that just happened.
   *
   * ── One toast for the press, not one per episode ─────────────────────────────────
   *
   * The write is one transaction and either lands whole or leaves nothing behind
   * (`markWatchedUpTo`), so there is exactly one thing that can be lost and exactly
   * one thing to say about it. `raise()` is called once, here, and the per-episode marks
   * are rolled back without raising any of their own.
   */
  async function markUpTo(
    through: WatchSubject,
    covered: readonly WatchSubject[],
    naming: WatchNaming,
  ): Promise<void> {
    // Before anything is marked, not after. A film has no episode list and so no control
    // (`programme-note-episodes.tsx`), which makes this a caller bug rather than a lost
    // write — but a throw raised *after* the optimistic marks were applied would leave a
    // dozen rows struck with nothing behind them, no rollback and no toast, which is
    // *a lost write is never silent* broken by the one path that is
    // supposed to be impossible. Refusing first costs nothing and cannot lie.
    const upToEpisodeId = through.episodeId;
    if (upToEpisodeId === null) {
      throw new Error("markUpTo was given a film, which has no episode to mark up to.");
    }

    const id = idOf(through);
    const write = upToWrites.get(id) ?? { key: null, raised: null };
    upToWrites.set(id, write);

    write.key ??= mintKey();
    const sourceKey = write.key;

    // Every covered row, optimistically watched and settled, and held so a failure can
    // put each one back exactly as it was at the moment of this press.
    const marked = covered.map((subject) => ensure(subject, UNSEEN));
    for (const one of marked) {
      one.written = true;
      holdRestore(one);
      /* `Math.max(1, …)` rather than `+ 1`, and this is the difference between this write
         and `mark`: the server does **not** write a second row for an episode already
         watched — `markWatchedUpTo` is `ON CONFLICT DO NOTHING` over derived keys, and
         `db/access.ts` says in as many words that *anything already recorded stays as it
         is*. So a covered row that was already watched keeps the count it had, and one
         that was not lands on exactly one. A press through ten episodes never manufactures
         ten rewatches. */
      apply(one, {
        watched: true,
        watches: Math.max(1, one.view.watches),
        phase: "settled",
        pending: true,
      });
    }

    const outcome = await recordUpTo(
      through.libraryEntryId,
      upToEpisodeId,
      sourceKey,
    );

    // The same guard `mark` states at length: an attempt only ever speaks for the write
    // it named, so an answer arriving after the key has moved on is not news.
    if (write.key !== sourceKey) return;

    if (outcome.ok) {
      write.key = null;
      for (const one of marked) {
        apply(one, {
          watched: true,
          watches: Math.max(1, one.view.watches),
          phase: "settled",
          pending: stillPending(one),
        });
      }
      if (write.raised) {
        write.raised.resolve();
        write.raised = null;
      }
      return;
    }

    for (const one of marked) {
      apply(one, { ...one.restore, pending: stillPending(one) });
    }

    // One toast per lost write, not one per attempt — and here, not one per episode.
    if (write.raised) return;

    write.raised = failures.raise({
      title: naming.title,
      episode: naming.episode,
      reference: outcome.reference,
      // The same key, so *Try again* is a retry of this press rather than a second one.
      retry: () => void markUpTo(through, covered, naming),
    });
  }

  /**
   * Whether this episode is still busy once the press it was part of has answered.
   *
   * A bulk write does not get to clear `pending` on an episode whose **own** write is
   * still on the wire — a single mark and a press through it can be outstanding at the
   * same time, and a row whose control comes back under a write it cannot see is a row
   * that can be pressed twice. `inFlight` is the question, and its own docblock says why
   * `key !== null` is not: a key survives a failed attempt on purpose.
   */
  function stillPending(one: Mark): boolean {
    return one.inFlight > 0;
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
  async function removeWatch(subject: WatchSubject): Promise<UnwatchActionOutcome> {
    try {
      return await writer.remove(subject);
    } catch (error) {
      return { ok: false, reference: referenceFor(error, { surface: "unwatch" }) };
    }
  }

  /** The same wrapper, around the undo. Its own `surface` so a reference id in a toast
   *  says which of the two deletes failed. */
  async function undoWrite(subject: WatchSubject): Promise<UnwatchActionOutcome> {
    try {
      return await writer.undo(subject);
    } catch (error) {
      return { ok: false, reference: referenceFor(error, { surface: "undo" }) };
    }
  }

  /** The same wrapper again, around the press through an episode. */
  async function recordUpTo(
    libraryEntryId: string,
    /** Never `null`: `markUpTo` refuses a film before it marks anything, and passing the
     *  narrowed id rather than the subject is what leaves no null here to fudge. */
    upToEpisodeId: string,
    sourceKey: string,
  ): Promise<MarkWatchedUpToActionOutcome> {
    try {
      return await writer.recordUpTo({
        libraryEntryId,
        upToEpisodeId,
        sourceKey,
      });
    } catch (error) {
      return {
        ok: false,
        reference: referenceFor(error, { surface: "mark-watched-up-to" }),
      };
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
    unwatch,
    undo,
    markUpTo,

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
 * React context for a reason the toast store's own docblock only half covers: nothing
 * guarantees the surfaces that end up sharing a mark sit in the same branch of the tree —
 * the desktop pane and the phone's pushed title-detail route were on different routes
 * entirely when this store was built, and #138 retired the surface that made that concrete
 * (`up-next-dominant-card.tsx`) — so a provider would have to be mounted above every
 * caller by a component with no other reason to know any of them exists.
 */
export const watchMarks = createWatchMarks({
  writer: {
    record: (params) => recordWatchAction(params),
    remove: (params) => unwatchAction(params),
    undo: (params) => undoWatchAction(params),
    recordUpTo: (params) => markWatchedUpToAction(params),
  },
});
