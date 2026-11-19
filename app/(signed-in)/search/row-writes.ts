import {
  raiseLostAdd,
  type AddIntention,
  type StandingAdd,
} from "@/app/(signed-in)/catalogue/lost-add";
import { writeFailures, type WriteFailureStore } from "@/errors/write-failure";
import type { AddOutcome, AddToLibraryOutcome } from "./actions";

/**
 * One Search row's writes — issue #550: the add, then *Seen it all* / *Seen it* and the
 * switch back to *Not started*, in order, with the lost-write toast.
 *
 * A function over plain values and not a hook, `lost-add.ts`'s reasoning: the rules below
 * are about *order* and *which toast*, and `tests/search-row-writes.test.ts` drives them
 * against a real store with no React and writes it releases by hand. The hook that puts
 * this on a row is `use-catalogue-add.ts`, and it is thin.
 *
 * ── What the row shows ───────────────────────────────────────────────────────────────
 *
 * `open` offers *Add*. `adding` is today's optimistic *In your library*, before the server
 * has answered. `added` is that answer — the entry the chips write against, whether *Seen
 * it all* is worth offering (#537), and which chip is chosen. `held` is a title that was
 * already in the library when the results arrived: it gets the statement and no chips,
 * because the spec's switch back is only safe on a title **added in this search** — the
 * entry had no watches before the press, so deleting the press's rows cannot take anyone's
 * earlier history with it.
 *
 * The chosen chip is **optimistic**, like the add: it moves when pressed and goes back
 * when the write is lost — to the last state the server is known to hold (`settled`), not
 * to whatever was there before the press, so a lost *switch back* puts *Seen it all* back
 * because those watches are still there.
 *
 * ── One write at a time ──────────────────────────────────────────────────────────────
 *
 * A press made while an earlier write is in flight waits for it (`tail`), then runs.
 * *Not started* pressed while *Seen it all* is still saving would otherwise send the
 * delete first — to a server with nothing yet to delete — and leave the watches behind
 * when the first write landed after it. The queue is the whole fix.
 *
 * ── Keys ─────────────────────────────────────────────────────────────────────────────
 *
 * Each *Seen it all* press mints one key and every retry of it reuses it, so a retry is
 * the same write (`UNIQUE (user_id, source, source_key)`) and a retry that raced a write
 * which landed records nothing twice. The switch back deletes by every key the row has sent, not only the latest: a
 * *Seen it all* pressed while an earlier press's watches are still there records nothing
 * under its own key.
 *
 * ── Toasts ───────────────────────────────────────────────────────────────────────────
 *
 * One standing toast per row, about the reader's latest intention (`lost-add.ts`). A lost
 * write raises or keeps it; a write that **lands** takes it down — including a later
 * intention that lands over an earlier one that was lost, since the reader has moved on
 * and what they last asked for is true.
 */

/** Which chip is chosen. A film's *Seen it* toggle is the same two states. */
export type RowChoice = "not-started" | "seen-all";

export type RowState =
  | { readonly phase: "held" }
  | { readonly phase: "open" }
  | { readonly phase: "adding" }
  | {
      readonly phase: "added";
      readonly libraryEntryId: string;
      readonly hasAiredEpisode: boolean;
      readonly choice: RowChoice;
    };

export interface RowWriteDeps {
  /** Named in full in the toast. */
  readonly title: string;
  readonly initial: Extract<RowState, { phase: "held" | "open" }>;
  readonly add: () => Promise<AddToLibraryOutcome>;
  readonly seenAll: (libraryEntryId: string, sourceKey: string) => Promise<AddOutcome>;
  readonly undoSeenAll: (libraryEntryId: string, sourceKey: string) => Promise<AddOutcome>;
  /** A fresh idempotency key — one per *Seen it all* press. */
  readonly mintKey: () => string;
  /** Called with the new state after every change. */
  readonly onChange: (state: RowState) => void;
  readonly store?: WriteFailureStore;
}

export interface RowWrites {
  state(): RowState;
  /** Press *Add*, or retry it. */
  add(): Promise<void>;
  /**
   * Choose a chip. Resolves when every write queued so far, this one included, has
   * finished; read `state()` after it to see what the row ended on. Choosing the chip
   * already chosen sends nothing and resolves when the queue is empty.
   */
  choose(choice: RowChoice): Promise<void>;
}

export function createRowWrites(deps: RowWriteDeps): RowWrites {
  const store = deps.store ?? writeFailures;
  let state: RowState = deps.initial;
  let standing: StandingAdd | null = null;

  /** What the server is known to hold, for putting a chip back. */
  let settled: RowChoice = "not-started";
  /**
   * Every key this row has minted for *Seen it all* and not yet taken back. A later
   * press records nothing when an earlier one's watches are still there (the server skips
   * episodes already watched), so the switch back has to delete by all of them, not the
   * latest — which is safe because the row's title was added in this search.
   */
  const keys = new Set<string>();
  /** Bumped by every chip press, so a lost write can tell whether it is still the latest. */
  let latest = 0;
  /** The end of the queue. Every entry resolves; a write reports failure by raising. */
  let tail: Promise<void> = Promise.resolve();

  function set(next: RowState) {
    state = next;
    deps.onChange(next);
  }

  function setChoice(choice: RowChoice) {
    if (state.phase === "added") set({ ...state, choice });
  }

  function landed() {
    standing?.handle.resolve();
    standing = null;
  }

  function lost(intention: AddIntention, reference: string | null, retry: () => void) {
    standing = raiseLostAdd(
      standing,
      // Named in full. The toast composes its own sentences from this and takes no
      // message, so there is no parameter an exception could arrive in.
      { intention, title: deps.title, reference, retry },
      store,
    );
  }

  async function add(): Promise<void> {
    set({ phase: "adding" });
    const outcome = await deps.add();

    if (outcome.ok) {
      landed();
      set({
        phase: "added",
        libraryEntryId: outcome.libraryEntryId,
        hasAiredEpisode: outcome.hasAiredEpisode,
        choice: "not-started",
      });
      return;
    }

    set({ phase: "open" });
    lost("add", outcome.reference, () => void add());
  }

  /** Queue one write behind whatever is running. */
  function enqueue(write: () => Promise<void>): Promise<void> {
    tail = tail.then(write);
    return tail;
  }

  function seenAll(key: string, press: number): Promise<void> {
    return enqueue(async () => {
      if (state.phase !== "added") return;
      // Counted from the moment it is sent, not pressed: it may land without our hearing,
      // and a switch back queued before it must not undo a write that has not run.
      keys.add(key);
      const outcome = await deps.seenAll(state.libraryEntryId, key);

      if (outcome.ok) {
        settled = "seen-all";
        landed();
        return;
      }

      if (press === latest) setChoice(settled);
      lost("seen-all", outcome.reference, () => void retrySeenAll(key));
    });
  }

  function switchBack(press: number): Promise<void> {
    return enqueue(async () => {
      if (state.phase !== "added") return;

      // One key at a time, dropping each once its undo has landed, so a lost one leaves
      // exactly the keys still to take back for the retry.
      for (const key of [...keys]) {
        const outcome = await deps.undoSeenAll(state.libraryEntryId, key);
        if (outcome.ok) {
          keys.delete(key);
          continue;
        }

        if (press === latest) setChoice(settled);
        lost("switch-back", outcome.reference, () => void retrySwitchBack());
        return;
      }

      settled = "not-started";
      landed();
    });
  }

  /** The toast's *Try again* for *Seen it all*: the same press, so the same key. */
  function retrySeenAll(key: string): Promise<void> {
    setChoice("seen-all");
    return seenAll(key, ++latest);
  }

  function retrySwitchBack(): Promise<void> {
    setChoice("not-started");
    return switchBack(++latest);
  }

  function choose(choice: RowChoice): Promise<void> {
    if (state.phase !== "added" || state.choice === choice) return tail;

    setChoice(choice);
    const press = ++latest;

    if (choice === "seen-all") {
      return seenAll(deps.mintKey(), press);
    }

    return switchBack(press);
  }

  return { state: () => state, add, choose };
}
