import { describe, expect, it } from "vitest";

import {
  createRowWrites,
  type RowState,
  type RowWriteDeps,
} from "@/app/(signed-in)/search/row-writes";
import type { AddOutcome, AddToLibraryOutcome } from "@/app/(signed-in)/search/actions";
import { createWriteFailureStore } from "@/errors/write-failure";

/**
 * One Search row's writes — issue #550: the add, then *Seen it all* / *Seen it* and the
 * switch back. The rule is a sequence of events, so it is tested as one: real store, no
 * React, and fake writes the test releases by hand so "pressed while an earlier write is
 * in flight" is an order the test sets up rather than a race it hopes for.
 *
 * The fakes answer to a **log** of what the server would have been asked, in order. A
 * test that only looked at the final chip would pass for a queue that ran the undo before
 * the write it undoes, which is the failure that leaves watches behind.
 */

type Call = readonly [write: "add" | "seen-all" | "undo", key?: string];

interface Pending<T> {
  readonly resolve: (outcome: T) => void;
}

const ADDED: AddToLibraryOutcome = { ok: true, libraryEntryId: "entry-1", hasAiredEpisode: true };
const OK: AddOutcome = { ok: true };
const LOST = (reference: string) => ({ ok: false as const, reference });

function setup() {
  const store = createWriteFailureStore();
  const calls: Call[] = [];
  const waiting: { add: Pending<AddToLibraryOutcome>[]; seen: Pending<AddOutcome>[]; undo: Pending<AddOutcome>[] } = {
    add: [],
    seen: [],
    undo: [],
  };
  const states: RowState[] = [];
  let minted = 0;

  const deps: RowWriteDeps = {
    title: "Severance",
    initial: { phase: "open" },
    store,
    mintKey: () => `key-${++minted}`,
    onChange: (state) => states.push(state),
    add: () => {
      calls.push(["add"]);
      return new Promise((resolve) => waiting.add.push({ resolve }));
    },
    seenAll: (_entry, key) => {
      calls.push(["seen-all", key]);
      return new Promise((resolve) => waiting.seen.push({ resolve }));
    },
    undoSeenAll: (_entry, key) => {
      calls.push(["undo", key]);
      return new Promise((resolve) => waiting.undo.push({ resolve }));
    },
  };

  const row = createRowWrites(deps);
  const toasts = () => store.get().map((one) => one.reference);
  /** Let every promise reaction already queued run. */
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  /**
   * Answer the nth write of a kind. A queued write starts a microtask after the press, so
   * this lets it start first — the test would otherwise be answering a write not yet sent.
   */
  async function release(kind: keyof typeof waiting, index: number, outcome: AddOutcome | AddToLibraryOutcome) {
    await settle();
    (waiting[kind][index] as Pending<AddOutcome | AddToLibraryOutcome>).resolve(outcome);
    await settle();
  }

  /** Add and let it land, so the chips are there. */
  async function added() {
    void row.add();
    await release("add", 0, ADDED);
  }

  return { row, store, calls, waiting, states, toasts, settle, added, release };
}

const choiceOf = (row: ReturnType<typeof setup>["row"]) => {
  const state = row.state();
  return state.phase === "added" ? state.choice : null;
};

describe("the add", () => {
  it("shows the in-library row at once and the chips, not started, once it lands", async () => {
    const { row, release } = setup();

    void row.add();
    expect(row.state().phase).toBe("adding");

    await release("add", 0, { ok: true, libraryEntryId: "entry-9", hasAiredEpisode: false });

    expect(row.state()).toEqual({
      phase: "added",
      libraryEntryId: "entry-9",
      hasAiredEpisode: false,
      choice: "not-started",
    });
  });

  it("puts the Add back and raises one toast when it is lost, and a landed retry takes it down", async () => {
    const { row, toasts, store, release } = setup();

    void row.add();
    await release("add", 0, LOST("ref-add"));

    expect(row.state().phase).toBe("open");
    expect(toasts()).toEqual(["ref-add"]);

    // The toast's own Try again, not a press on the row.
    store.get()[0].retry?.();
    expect(row.state().phase).toBe("adding");
    await release("add", 1, ADDED);

    expect(toasts()).toEqual([]);
    expect(row.state().phase).toBe("added");
  });

  it("raises no second toast when the retry is lost too", async () => {
    const { row, toasts, store, release } = setup();

    void row.add();
    await release("add", 0, LOST("ref-1"));
    store.get()[0].retry?.();
    await release("add", 1, LOST("ref-2"));

    expect(toasts()).toEqual(["ref-1"]);
  });

  it("offers no chips on a title that was already held", () => {
    const store = createWriteFailureStore();
    const row = createRowWrites({
      title: "Severance",
      initial: { phase: "held" },
      store,
      mintKey: () => "k",
      onChange: () => {},
      add: async () => ADDED,
      seenAll: async () => OK,
      undoSeenAll: async () => OK,
    });

    expect(row.state()).toEqual({ phase: "held" });
  });
});

describe("Seen it all, and the switch back", () => {
  it("records with one key minted for the press, then takes back with the same key", async () => {
    const { row, calls, added, release } = setup();
    await added();

    void row.choose("seen-all");
    expect(choiceOf(row)).toBe("seen-all");
    await release("seen", 0, OK);

    void row.choose("not-started");
    await release("undo", 0, OK);

    expect(calls).toEqual([["add"], ["seen-all", "key-1"], ["undo", "key-1"]]);
    expect(choiceOf(row)).toBe("not-started");
  });

  it("holds Not started, pressed while Seen it all is saving, until that write has finished", async () => {
    const { row, calls, settle, added, release } = setup();
    await added();

    void row.choose("seen-all");
    void row.choose("not-started");
    await settle();

    // The setup of the claim: the first write is in flight and the second has not been
    // sent. If this line failed the test below would be about nothing.
    expect(calls).toEqual([["add"], ["seen-all", "key-1"]]);
    expect(choiceOf(row)).toBe("not-started");

    await release("seen", 0, OK);
    expect(calls).toEqual([["add"], ["seen-all", "key-1"], ["undo", "key-1"]]);

    await release("undo", 0, OK);
    expect(choiceOf(row)).toBe("not-started");
  });

  it("runs a longer run of quick presses in the order they were made", async () => {
    const { row, calls, added, release } = setup();
    await added();

    void row.choose("seen-all");
    void row.choose("not-started");
    void row.choose("seen-all");
    await release("seen", 0, OK);
    await release("undo", 0, OK);
    await release("seen", 1, OK);

    // Each *Seen it all* press has its own key, and the undo took back the first one's.
    expect(calls).toEqual([
      ["add"],
      ["seen-all", "key-1"],
      ["undo", "key-1"],
      ["seen-all", "key-2"],
    ]);
    expect(choiceOf(row)).toBe("seen-all");
  });

  it("sends nothing for pressing the chip that is already chosen", async () => {
    const { row, calls, added } = setup();
    await added();

    void row.choose("not-started");

    expect(calls).toEqual([["add"]]);
  });

  it("puts the chip back and raises one toast when Seen it all is lost; Try again reuses its key", async () => {
    const { row, calls, toasts, store, added, release } = setup();
    await added();

    void row.choose("seen-all");
    await release("seen", 0, LOST("ref-seen"));

    expect(choiceOf(row)).toBe("not-started");
    expect(toasts()).toEqual(["ref-seen"]);

    store.get()[0].retry?.();
    expect(choiceOf(row)).toBe("seen-all");
    await release("seen", 1, OK);

    expect(calls.filter(([write]) => write === "seen-all")).toEqual([
      ["seen-all", "key-1"],
      ["seen-all", "key-1"],
    ]);
    expect(toasts()).toEqual([]);
    expect(choiceOf(row)).toBe("seen-all");
  });

  it("resolves a lost Seen it all when the switch back that followed it lands", async () => {
    const { row, toasts, added, release } = setup();
    await added();

    void row.choose("seen-all");
    void row.choose("not-started");
    await release("seen", 0, LOST("ref-seen"));
    // The setup: the toast is up before the queued switch back has run.
    expect(toasts()).toEqual(["ref-seen"]);

    await release("undo", 0, OK);

    // The reader's last word was *Not started*, and it is true on the server.
    expect(toasts()).toEqual([]);
    expect(choiceOf(row)).toBe("not-started");
  });

  it("replaces a lost Seen it all with one for the switch back when that is lost", async () => {
    const { row, calls, toasts, store, added, release } = setup();
    await added();

    void row.choose("seen-all");
    void row.choose("not-started");
    await release("seen", 0, LOST("ref-seen"));
    await release("undo", 0, LOST("ref-undo"));

    expect(toasts()).toEqual(["ref-undo"]);

    store.get()[0].retry?.();
    expect(calls[calls.length - 1]).toEqual(["undo", "key-1"]);
    await release("undo", 1, OK);
    expect(toasts()).toEqual([]);
  });

  it("puts Seen it all back when the switch back is lost, because the watches are still there", async () => {
    const { row, added, release } = setup();
    await added();

    void row.choose("seen-all");
    await release("seen", 0, OK);
    void row.choose("not-started");
    await release("undo", 0, LOST("ref-undo"));

    expect(choiceOf(row)).toBe("seen-all");
  });

  it("works the same way for a film's toggle: on then off leaves it unwatched", async () => {
    const { row, calls, added, release } = setup();
    await added();

    // The film chip's two states are the same two choices.
    void row.choose("seen-all");
    void row.choose("not-started");
    await release("seen", 0, OK);
    await release("undo", 0, OK);

    expect(calls.map(([write]) => write)).toEqual(["add", "seen-all", "undo"]);
    expect(choiceOf(row)).toBe("not-started");
  });
});

describe("Pick an episode", () => {
  it("takes Seen it all back first, and only then reports the row as ready", async () => {
    const { row, calls, settle, added, release } = setup();
    await added();
    void row.choose("seen-all");
    await release("seen", 0, OK);

    let ready = false;
    const picked = row.choose("not-started").then(() => (ready = true));
    await settle();

    expect(calls[calls.length - 1]).toEqual(["undo", "key-1"]);
    expect(ready).toBe(false);

    await release("undo", 0, OK);
    await picked;
    expect(ready).toBe(true);
    expect(choiceOf(row)).toBe("not-started");
  });

  it("is not ready, and says so, when the take-back is lost", async () => {
    const { row, toasts, added, release } = setup();
    await added();
    void row.choose("seen-all");
    await release("seen", 0, OK);

    const picked = row.choose("not-started");
    await release("undo", 0, LOST("ref-undo"));
    await picked;

    // The caller navigates only when the row is back at Not started.
    expect(choiceOf(row)).toBe("seen-all");
    expect(toasts()).toEqual(["ref-undo"]);
  });

  it("waits for a Seen it all still saving before it is ready", async () => {
    const { row, settle, added, release } = setup();
    await added();
    void row.choose("seen-all");
    void row.choose("not-started");

    let ready = false;
    const picked = row.choose("not-started").then(() => (ready = true));
    await settle();
    expect(ready).toBe(false);

    await release("seen", 0, OK);
    await release("undo", 0, OK);
    await picked;

    expect(ready).toBe(true);
  });
});

/**
 * A server that follows the real database rules, so the test is about what is left on it
 * and not about which calls were made: a *Seen it all* records only the episodes the entry
 * has not watched yet (`markWatchedUndated` skips the rest), under that press's key, and
 * an undo deletes what was recorded under the key it is given.
 */
function realisticServer(lostUndos: readonly number[]) {
  const watches = new Map<string, string>(); // episode -> the key that recorded it
  const episodes = ["s1e1", "s1e2", "s1e3"];
  const calls: string[] = [];
  let undos = 0;

  const deps = {
    add: async (): Promise<AddToLibraryOutcome> => ADDED,
    seenAll: async (_entry: string, key: string): Promise<AddOutcome> => {
      calls.push(`seen ${key}`);
      for (const episode of episodes) if (!watches.has(episode)) watches.set(episode, key);
      return OK;
    },
    undoSeenAll: async (_entry: string, key: string): Promise<AddOutcome> => {
      calls.push(`undo ${key}`);
      if (lostUndos.includes(++undos)) return LOST(`ref-undo-${undos}`);
      for (const [episode, recordedBy] of watches) if (recordedBy === key) watches.delete(episode);
      return OK;
    },
  };

  return { deps, watches, calls };
}

describe("a switch back that was lost, then Seen it all and Not started again", () => {
  async function run(awaitEachPress: boolean) {
    const server = realisticServer([1]);
    const store = createWriteFailureStore();
    let minted = 0;
    const row = createRowWrites({
      title: "Severance",
      initial: { phase: "open" },
      store,
      mintKey: () => `key-${++minted}`,
      onChange: () => {},
      ...server.deps,
    });
    await row.add();

    // Quick presses are not awaited, so the chip has already moved when the next comes.
    const press = async (choice: "seen-all" | "not-started") => {
      const done = row.choose(choice);
      if (awaitEachPress) await done;
    };
    await press("seen-all");
    await press("not-started");
    await press("seen-all");
    await press("not-started");
    await row.choose("not-started");
    return { row, server, store };
  }

  for (const awaitEachPress of [true, false]) {
    it(`leaves no watches and no toast (${awaitEachPress ? "each press awaited" : "pressed quickly"})`, async () => {
      const { row, server, store } = await run(awaitEachPress);

      // The setup: the first Seen it all recorded under key-1 and the first undo was lost,
      // so the later presses ran against a server that already held every watch.
      expect(server.calls[0]).toBe("seen key-1");
      expect(server.calls[1]).toBe("undo key-1");
      expect(server.calls.filter((call) => call.startsWith("undo")).length).toBeGreaterThan(1);
      expect(choiceOf(row)).toBe("not-started");
      expect([...server.watches]).toEqual([]);
      expect(store.get()).toEqual([]);
    });
  }

  it("keeps the toast up, and the chip on Seen it all, while the watches are still there", async () => {
    const server = realisticServer([1, 2, 3, 4]);
    const store = createWriteFailureStore();
    let minted = 0;
    const row = createRowWrites({
      title: "Severance",
      initial: { phase: "open" },
      store,
      mintKey: () => `key-${++minted}`,
      onChange: () => {},
      ...server.deps,
    });
    await row.add();
    await row.choose("seen-all");
    await row.choose("not-started");

    expect(server.watches.size).toBe(3);
    expect(store.get().map((toast) => toast.reference)).toEqual(["ref-undo-1"]);
    expect(choiceOf(row)).toBe("seen-all");
  });
});
