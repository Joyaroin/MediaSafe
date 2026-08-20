import { describe, expect, it } from "vitest";

import type {
  MarkWatchedUpToActionOutcome,
  UnwatchActionOutcome,
  WatchActionOutcome,
} from "@/app/(signed-in)/library/watch-action";
import {
  createWatchMarks,
  type WatchMarkView,
  type WatchSubject,
} from "@/app/(signed-in)/library/watch-marks";
import { createWriteFailureStore } from "@/errors/write-failure";

/**
 * One outstanding write per episode, however many surfaces are showing it — issue #103,
 * against `app/(signed-in)/library/watch-marks.ts`.
 *
 * ── Why this is where the coverage goes ──────────────────────────────────────────────
 *
 * The store is the whole of the write: the key, the rollback and the toast. `useWatchMark`
 * is a `useSyncExternalStore` binding over it and its callers are markup, so a test that
 * rendered components would spend its weight on wiring and reach none of the properties
 * #103 is about. Everything below drives the store directly, with two subscribers
 * standing in for any two surfaces that end up showing the same episode at once — the
 * desktop TONIGHT row and the programme note were the pair that motivated the fix, and
 * issue #136 deleted the row, but the property under test was never about that specific
 * pair: it is that *whichever* surfaces share an episode agree, which two bare
 * subscribers prove without needing a real second caller mounted to stand for one.
 *
 * ── What "one row" means here ────────────────────────────────────────────────────────
 *
 * This file never reaches Postgres, so it does not count rows; it counts **distinct
 * idempotency keys**, which is the thing the browser controls. That one key means one row
 * is `UNIQUE (user_id, source, source_key)` plus `onConflictDoNothing`, and it is proved
 * against real Postgres by `tests/watch-idempotency.test.ts` — *"is a no-op on a retry —
 * the same key twice is one row"* — which this leans on rather than restates.
 *
 * ── No network, no server, no clock ──────────────────────────────────────────────────
 *
 * `createWatchMarks` takes its writer, its toast store and its key mint, so every write
 * here is a promise this file resolves by hand. That is what makes *while the first is
 * still in flight* a thing a test can express at all.
 */

const EPISODE: WatchSubject = { libraryEntryId: "entry-1", episodeId: "episode-1" };
const NAMING = { title: "Better Call Saul", episode: "Season 1, Episode 2 — Mijo" };

/** What every surface but the programme note's seeds an episode with. */
const UNWATCHED: WatchMarkView = {
  watched: false,
  phase: "unwatched",
  pending: false,
};

/** An episode the server already knows this account has watched. */
const WATCHED: WatchMarkView = {
  watched: true,
  phase: "settled",
  pending: false,
};

function harness() {
  /** Every `sourceKey` the writer was handed, in order — the file's central assertion. */
  const recorded: string[] = [];
  const answerRecord: Array<(outcome: WatchActionOutcome) => void> = [];
  const answerRemove: Array<(outcome: UnwatchActionOutcome) => void> = [];
  /** Every *watched up to here* press the writer was handed — issue #196. */
  const upTo: Array<{
    readonly libraryEntryId: string;
    readonly upToEpisodeId: string;
    readonly sourceKey: string;
  }> = [];
  const answerUpTo: Array<
    (outcome: MarkWatchedUpToActionOutcome) => void
  > = [];
  let minted = 0;

  const failures = createWriteFailureStore();
  const marks = createWatchMarks({
    writer: {
      record(params) {
        recorded.push(params.sourceKey);
        return new Promise((resolve) => answerRecord.push(resolve));
      },
      remove() {
        return new Promise((resolve) => answerRemove.push(resolve));
      },
      recordUpTo(params) {
        upTo.push(params);
        return new Promise((resolve) => answerUpTo.push(resolve));
      },
    },
    failures,
    // A counter rather than a uuid, for the same reason the toast store uses one: a test
    // can read the sequence, and "the second press minted a second key" is then a
    // statement about a value rather than about two opaque strings differing.
    mintKey: () => `key-${(minted += 1)}`,
  });

  /** A surface showing this episode: what it renders, and how often it was told to. */
  function surface(subject: WatchSubject, initial = UNWATCHED) {
    let renders = 0;
    const unsubscribe = marks.subscribe(subject, initial, () => {
      renders += 1;
    });
    return {
      unsubscribe,
      get renders() {
        return renders;
      },
      view: () => marks.read(subject),
    };
  }

  return {
    marks,
    failures,
    recorded,
    answerRecord,
    answerRemove,
    upTo,
    answerUpTo,
    surface,
  };
}

/** The one lost write on screen, or `undefined` — the toast's own view of the world. */
function onlyToast(failures: ReturnType<typeof createWriteFailureStore>) {
  const raised = failures.get();
  expect(raised.length).toBeLessThanOrEqual(1);
  return raised[0];
}

describe("one outstanding write per episode", () => {
  it("gives two surfaces showing the same episode one key, not one each", async () => {
    const { marks, recorded, answerRecord, surface } = harness();
    // Two separate objects naming the same episode — the desktop's two surfaces do not
    // share a props object either, and identity by value is what makes them one mark.
    const row = surface({ libraryEntryId: "entry-1", episodeId: "episode-1" });
    const note = surface({ libraryEntryId: "entry-1", episodeId: "episode-1" });

    const fromTheRow = marks.mark(EPISODE, NAMING);
    // The press on the second surface, while the first is still on the wire.
    const fromTheNote = marks.mark(EPISODE, NAMING);

    expect(recorded).toEqual(["key-1", "key-1"]);

    answerRecord[0]({ ok: true });
    answerRecord[1]({ ok: true });
    await Promise.all([fromTheRow, fromTheNote]);

    // Two presses, two requests, one key — so one row, per `tests/watch-idempotency.test.ts`.
    expect(new Set(recorded).size).toBe(1);
    // And both surfaces are struck, without either one reloading anything.
    expect(row.view()).toMatchObject({ watched: true, pending: false });
    expect(note.view()).toBe(row.view());
    expect(row.renders).toBeGreaterThan(0);
    expect(note.renders).toBeGreaterThan(0);
  });

  it("mints a key only when nothing is outstanding, and keeps it until the write lands", async () => {
    const { marks, recorded, answerRecord, surface } = harness();
    surface(EPISODE);

    const lost = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: false, reference: "ref-1" });
    await lost;

    // The failure did not clear it: the write is still outstanding, whatever route comes
    // back to it next.
    const again = marks.mark(EPISODE, NAMING);
    answerRecord[1]({ ok: true });
    await again;

    expect(recorded).toEqual(["key-1", "key-1"]);
  });

  it("mints a new key for a deliberate rewatch made after the previous write settled", async () => {
    const { marks, recorded, answerRecord, surface } = harness();
    surface(EPISODE);

    const first = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: true });
    await first;

    // A different gesture entirely — nothing is outstanding by now, so this is a watch of
    // its own and must be a second row. 1,156 of these are already in the library.
    const rewatch = marks.mark(EPISODE, NAMING);
    answerRecord[1]({ ok: true });
    await rewatch;

    expect(recorded).toEqual(["key-1", "key-2"]);
  });

  it("keeps episodes and films apart, so one entry's marks never share a key", async () => {
    const { marks, recorded, answerRecord, surface } = harness();
    const otherEpisode: WatchSubject = {
      libraryEntryId: "entry-1",
      episodeId: "episode-2",
    };
    const film: WatchSubject = { libraryEntryId: "entry-1", episodeId: null };
    surface(EPISODE);
    surface(otherEpisode);
    surface(film);

    const marking = [
      marks.mark(EPISODE, NAMING),
      marks.mark(otherEpisode, NAMING),
      marks.mark(film, { title: "Heat" }),
    ];
    answerRecord.forEach((answer) => answer({ ok: true }));
    await Promise.all(marking);

    expect(recorded).toEqual(["key-1", "key-2", "key-3"]);
  });
});

describe("a lost write, across surfaces", () => {
  it("raises one toast however many surfaces the reader pressed", async () => {
    const { marks, failures, answerRecord, surface } = harness();
    surface(EPISODE);
    surface(EPISODE);

    const fromTheRow = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: false, reference: "ref-1" });
    await fromTheRow;

    const fromTheNote = marks.mark(EPISODE, NAMING);
    answerRecord[1]({ ok: false, reference: "ref-2" });
    await fromTheNote;

    // A second failed attempt has nothing new to say, and a stack of identical toasts
    // buries the title that was lost (`AGENTS.md`).
    expect(failures.get()).toHaveLength(1);
    expect(onlyToast(failures)).toMatchObject({ title: NAMING.title, reference: "ref-1" });
  });

  it("puts every surface back to what it showed before the press", async () => {
    const { marks, answerRecord, surface } = harness();
    // A rewatch of an already-watched episode: the appearance a failure has to restore is
    // not the empty one, and getting that wrong would leave a struck row unstruck.
    const row = surface(EPISODE, WATCHED);
    const note = surface(EPISODE, WATCHED);

    const lost = marks.mark(EPISODE, NAMING);
    expect(row.view()).toMatchObject({ phase: "marking", pending: true });

    answerRecord[0]({ ok: false, reference: "ref-1" });
    await lost;

    expect(row.view()).toEqual(WATCHED);
    expect(note.view()).toBe(row.view());
  });

  it("resolves the optimistic state on both surfaces when the toast's retry lands", async () => {
    const { marks, failures, recorded, answerRecord, surface } = harness();
    const row = surface(EPISODE);
    const note = surface(EPISODE);

    const lost = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: false, reference: "ref-1" });
    await lost;

    // Rolled back everywhere, not only on the surface that was pressed.
    expect(row.view()).toEqual(UNWATCHED);
    expect(note.view()).toEqual(UNWATCHED);

    const retry = onlyToast(failures)?.retry;
    expect(retry).toBeTypeOf("function");
    retry?.();
    answerRecord[1]({ ok: true });
    // The retry is fire-and-forget from the toast's side, so let its promise drain.
    await Promise.resolve();
    await Promise.resolve();

    // The third route back to the same write carried the same key.
    expect(recorded).toEqual(["key-1", "key-1"]);
    expect(failures.get()).toHaveLength(0);
    expect(row.view()).toMatchObject({ watched: true, pending: false });
    expect(note.view()).toBe(row.view());
  });

  it("ignores an attempt that answers after the write it named has landed", async () => {
    const { marks, failures, recorded, answerRecord, surface } = harness();
    const row = surface(EPISODE);

    // The state that opens this: a lost write leaves the key outstanding, the episode
    // back to unwatched, and every route back to that write live at the same time — both
    // surfaces' controls and the toast's *Try again*.
    const lost = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: false, reference: "ref-1" });
    await lost;

    // Two of those routes, pressed in quick succession. Both carry the one key.
    const fromTheToast = marks.mark(EPISODE, NAMING);
    const fromTheRow = marks.mark(EPISODE, NAMING);
    expect(recorded).toEqual(["key-1", "key-1", "key-1"]);

    answerRecord[1]({ ok: true });
    await fromTheToast;

    // The duplicate now fails, after the write it named has already landed. Reading that
    // as news would put a struck episode back to unwatched and raise a toast whose *Try
    // again* mints a fresh key — a second row against an episode that already has one.
    answerRecord[2]({ ok: false, reference: "ref-2" });
    await fromTheRow;

    expect(row.view()).toMatchObject({ watched: true, pending: false });
    expect(failures.get()).toHaveLength(0);
    expect(new Set(recorded).size).toBe(1);
  });

  it("still reports the failure when the duplicate is the one that answers first", async () => {
    const { marks, failures, answerRecord, surface } = harness();
    const row = surface(EPISODE);

    const first = marks.mark(EPISODE, NAMING);
    const second = marks.mark(EPISODE, NAMING);

    // Nothing has landed yet, so this answer is the only news there is — the guard above
    // must not swallow a genuine loss just because two requests were in flight.
    answerRecord[0]({ ok: false, reference: "ref-1" });
    await first;
    expect(failures.get()).toHaveLength(1);
    expect(row.view()).toEqual(UNWATCHED);

    // And the one still on the wire settles it when it lands.
    answerRecord[1]({ ok: true });
    await second;
    expect(failures.get()).toHaveLength(0);
    expect(row.view()).toMatchObject({ watched: true, pending: false });
  });

  it("leaves the episode unwatched once an unwatch lands, on every surface", async () => {
    const { marks, answerRemove, surface } = harness();
    const row = surface(EPISODE, WATCHED);
    const note = surface(EPISODE, WATCHED);

    const unwatching = marks.unwatch(EPISODE, NAMING);
    // Struck off before the server has answered — the optimistic half.
    expect(row.view()).toMatchObject({ watched: false, pending: true });

    answerRemove[0]({ ok: true });
    await unwatching;

    // #89 read `watched` and `unwatchable` back off the wire here, because an imported
    // watch or the earlier half of a rewatch could have survived the delete and left the
    // row struck. #145 removes every watch of the episode, so the guess the press made is
    // simply right, and `ok` is all that comes back.
    expect(row.view()).toEqual({ watched: false, phase: "unwatched", pending: false });
    expect(note.view()).toEqual(row.view());
  });

  it("puts a lost unwatch back to struck and names it in a toast that does not expire", async () => {
    const { marks, failures, answerRemove, surface } = harness();
    const row = surface(EPISODE, WATCHED);

    const lost = marks.unwatch(EPISODE, NAMING);
    answerRemove[0]({ ok: false, reference: "ref-1" });
    await lost;

    // Back to exactly the appearance the row had at the moment of the press.
    expect(row.view()).toEqual(WATCHED);
    expect(onlyToast(failures)).toMatchObject({
      title: NAMING.title,
      episode: NAMING.episode,
      reference: "ref-1",
    });
  });

  it("does not let a landed mark take down a lost unwatch's toast", async () => {
    const { marks, failures, answerRecord, answerRemove, surface } = harness();
    surface(EPISODE, WATCHED);

    const lostUnwatch = marks.unwatch(EPISODE, NAMING);
    answerRemove[0]({ ok: false, reference: "ref-1" });
    await lostUnwatch;
    expect(failures.get()).toHaveLength(1);
    // A lost delete is not offered a retry — see `unwatch`'s docblock.
    expect(onlyToast(failures)?.retry).toBeUndefined();

    const rewatch = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: true });
    await rewatch;

    // The unwatch is still lost, and there is now one more watch than the reader asked
    // for. Resolving here would take the only notice of it off the screen.
    expect(failures.get()).toHaveLength(1);
  });
});

describe("a surface arriving with its own server read", () => {
  it("lets the newer read win while nothing has written to the episode", () => {
    const { surface } = harness();
    // A programme note row seeds from the episode it renders, unwatched.
    const row = surface(EPISODE);
    // The programme note opens later, from a `getTitleDetail` that knows about a watch
    // this store never made — an import, one client-side navigation away via settings.
    surface(EPISODE, WATCHED);

    expect(row.view()).toEqual(WATCHED);
  });

  it("keeps the mark once the reader has written to it, however stale the newer read", async () => {
    const { marks, answerRecord, surface } = harness();
    const note = surface(EPISODE);

    const marking = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: true });
    await marking;
    marks.settle(EPISODE);

    // A surface whose props were read before that press — reseeding from them would
    // un-strike an episode the reader has just marked, which is a landed write reading as
    // a lost one.
    surface(EPISODE, UNWATCHED);

    expect(note.view()).toMatchObject({ watched: true, phase: "settled" });
  });

  it("does not let a newer read reach a write still in flight", () => {
    const { marks, surface } = harness();
    const row = surface(EPISODE);

    void marks.mark(EPISODE, NAMING);
    surface(EPISODE, UNWATCHED);

    expect(row.view()).toMatchObject({ phase: "marking", pending: true });
  });
});

describe("the strike", () => {
  it("settles once, from whichever surface's animation ends first", async () => {
    const { marks, answerRecord, surface } = harness();
    const row = surface(EPISODE);
    const note = surface(EPISODE);

    const marking = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: true });
    await marking;
    expect(row.view()).toMatchObject({ phase: "marking" });

    marks.settle(EPISODE);
    expect(row.view()).toMatchObject({ phase: "settled" });
    expect(note.view()).toBe(row.view());

    // The second surface's animation ending is a no-op rather than a second transition.
    const settled = row.view();
    marks.settle(EPISODE);
    expect(row.view()).toBe(settled);
  });

  it("cannot re-settle an episode a failure has already put back", async () => {
    const { marks, answerRecord, surface } = harness();
    const row = surface(EPISODE);

    const lost = marks.mark(EPISODE, NAMING);
    answerRecord[0]({ ok: false, reference: "ref-1" });
    await lost;

    marks.settle(EPISODE);

    expect(row.view()).toEqual(UNWATCHED);
  });
});

/**
 * *Watched up to here* — issue #196, driven through the same store for the same reason
 * the per-episode write is: one press moves a dozen rows, each of which any number of
 * surfaces may be showing.
 *
 * The properties below are the ones that fail **silently**. A sweep that plays on every
 * row is loud and would be noticed on the first press; a toast raised sixty-two times is
 * loud too. What is quiet is a row left reading unwatched with a landed write behind it,
 * a retry that mints a second key, and a bulk answer re-enabling a control whose own
 * write is still on the wire.
 */
const THROUGH: WatchSubject = { libraryEntryId: "entry-1", episodeId: "episode-3" };
const COVERED: readonly WatchSubject[] = [
  { libraryEntryId: "entry-1", episodeId: "episode-1" },
  { libraryEntryId: "entry-1", episodeId: "episode-2" },
  { libraryEntryId: "entry-1", episodeId: "episode-3" },
];
const THROUGH_NAMING = {
  title: "Better Call Saul",
  episode: "3 episodes, through Season 1, Episode 3 — Nacho",
};

describe("marking watched up to an episode", () => {
  it("sends the episode pressed and one key, and never the set", async () => {
    const { marks, upTo, answerUpTo } = harness();

    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[0]({ ok: true });
    await press;

    expect(upTo).toEqual([
      {
        libraryEntryId: "entry-1",
        upToEpisodeId: "episode-3",
        sourceKey: "key-1",
      },
    ]);
  });

  it("settles every covered row without a sweep playing on any of them", async () => {
    const { marks, answerUpTo, surface } = harness();
    const rows = COVERED.map((subject) => surface(subject));

    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[0]({ ok: true });
    await press;

    for (const row of rows) {
      // `settled`, never `marking` — `EpisodeLine` draws `WatchSweep` only for `marking`,
      // so this is what "nothing sweeps; rows arrive settled" is, at the seam that
      // decides it.
      expect(row.view()).toEqual({ watched: true, phase: "settled", pending: false });
    }
  });

  it("strikes the rows before the server has answered, and puts them all back if it fails", async () => {
    const { marks, failures, answerUpTo, surface } = harness();
    const rows = COVERED.map((subject) => surface(subject));

    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);

    // Optimistic, and already settled: the reader sees the show recorded at once.
    expect(rows.map((row) => row.view()?.watched)).toEqual([true, true, true]);

    answerUpTo[0]({ ok: false, reference: "ref-1" });
    await press;

    // Nothing behind, nothing on screen — the write is one transaction, so a half-struck
    // season would be a lie about the table (`markWatchedUpTo`).
    for (const row of rows) expect(row.view()).toEqual(UNWATCHED);
    expect(onlyToast(failures)).toMatchObject({ title: "Better Call Saul" });
  });

  it("raises exactly one toast for the press, not one per episode", async () => {
    const { marks, failures, answerUpTo } = harness();

    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[0]({ ok: false, reference: "ref-1" });
    await press;

    // `onlyToast` asserts the count itself; the episode line is what makes the one toast
    // legible about a write that lost more than one episode.
    expect(failures.get()).toHaveLength(1);
    expect(onlyToast(failures)?.episode).toBe(THROUGH_NAMING.episode);
  });

  it("retries the same press rather than starting a second one", async () => {
    const { marks, failures, upTo, answerUpTo } = harness();

    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[0]({ ok: false, reference: "ref-1" });
    await press;

    onlyToast(failures)?.retry?.();
    answerUpTo[1]({ ok: true });
    // The retry is a fresh promise inside the toast's closure; a turn of the loop is what
    // lets it finish before the assertions below read the result.
    await Promise.resolve();
    await Promise.resolve();

    // Two requests, one key — the same guarantee a per-episode retry has, and the reason
    // a lost press cannot become a second set of rows.
    expect(upTo.map((one) => one.sourceKey)).toEqual(["key-1", "key-1"]);
    expect(failures.get()).toHaveLength(0);
  });

  it("mints a new key for a deliberate second press, once the first has landed", async () => {
    const { marks, upTo, answerUpTo } = harness();

    const first = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[0]({ ok: true });
    await first;

    const second = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[1]({ ok: true });
    await second;

    expect(upTo.map((one) => one.sourceKey)).toEqual(["key-1", "key-2"]);
  });

  it("leaves a row busy whose own write is still on the wire", async () => {
    const { marks, answerRecord, answerUpTo, surface } = harness();
    const own = COVERED[0];
    const row = surface(own);

    // The reader struck one episode, then pressed through a later one before the first
    // came back — two writes, one of them covering the other's episode.
    const single = marks.mark(own, NAMING);
    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);

    answerUpTo[0]({ ok: true });
    await press;

    // The bulk answer must not re-enable this row's control: its own write has not been
    // answered, and a second press against it would be a rewatch nothing on screen
    // distinguishes from a real one.
    expect(row.view()).toMatchObject({ watched: true, pending: true });

    answerRecord[0]({ ok: true });
    await single;

    expect(row.view()).toMatchObject({ watched: true, pending: false });
  });

  it("hands a row back after a press, even where its own earlier mark was lost", async () => {
    const { marks, answerRecord, answerUpTo, surface } = harness();
    const own = COVERED[0];
    const row = surface(own);

    // This episode's own mark failed and was never retried, so it still holds its key —
    // deliberately, so the toast's *Try again* is a retry rather than a second write.
    const lost = marks.mark(own, NAMING);
    answerRecord[0]({ ok: false, reference: "ref-1" });
    await lost;

    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[0]({ ok: true });
    await press;

    // Nothing is on the wire, so nothing is busy. Reading the surviving key as *in
    // flight* would leave this row's controls dead for the life of the page — a landed
    // write that takes the row with it.
    expect(row.view()).toEqual({ watched: true, phase: "settled", pending: false });
  });

  it("does not un-strike a row whose own write landed, when the press is lost", async () => {
    const { marks, answerRecord, answerUpTo, surface } = harness();
    const own = COVERED[0];
    const row = surface(own);

    const single = marks.mark(own, NAMING);
    answerRecord[0]({ ok: true });
    await single;

    const press = marks.markUpTo(THROUGH, COVERED, THROUGH_NAMING);
    answerUpTo[0]({ ok: false, reference: "ref-1" });
    await press;

    // What a failure puts back is the appearance as of the press — and as of this press
    // that row was already watched, by a write of its own that landed. Rolling it to
    // unwatched would be a landed write reading as a lost one.
    expect(row.view()).toMatchObject({ watched: true });
  });
});
