import { describe, expect, it } from "vitest";

import type {
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

  return { marks, failures, recorded, answerRecord, answerRemove, surface };
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
    // An Up next surface seeds every episode unwatched — `listUpNext` only ever returns
    // an unwatched next episode, so it has no watched state to seed with.
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
