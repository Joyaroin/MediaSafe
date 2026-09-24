import { describe, expect, it } from "vitest";

import { raiseLostAdd, type StandingAdd } from "@/app/(signed-in)/catalogue/lost-add";
import { createWriteFailureStore } from "@/errors/write-failure";

/**
 * What a second lost add does to the first one's toast — issue #222, and the bug the
 * two-axis review of it found.
 *
 * ── Why this rule earns a test where a single control's guard did not ────────────────
 *
 * The line is drawn at what fails **silently**, and this is the sharpest kind:
 * the failure it exists to stop is not a missing toast but a **resolved** one. A lost
 * *Add — watched* answered by a standing plain-add toast leaves the reader pressing *Try
 * again*, watching the title arrive, and never learning that the watches did not. Every
 * surface then agrees the write landed — which is *a lost write is never
 * silent*, broken in the one way that leaves nothing behind to notice.
 *
 * The store is the **real** one (`createWriteFailureStore`), not a fake. `standing()` and
 * `resolve()` are the two things this rule turns on, and a fake that answered them from
 * its own bookkeeping would be a test of the fake — the same argument
 * `vitest.config.mts` makes for running against real Postgres rather than a mocked
 * constraint.
 */

const PLAIN = { watched: false, title: "The Bear", reference: "ref-1" } as const;
const WATCHED = { watched: true, title: "The Bear", reference: "ref-2" } as const;

const noop = () => {};

/** What is on screen, in the shape a reader would describe it. */
function onScreen(store: ReturnType<typeof createWriteFailureStore>) {
  return store.get().map((one) => one.title);
}

describe("raiseLostAdd", () => {
  it("raises a toast for the first lost add", () => {
    const store = createWriteFailureStore();

    const standing = raiseLostAdd(null, { ...PLAIN, retry: noop }, store);

    expect(onScreen(store)).toEqual(["The Bear"]);
    expect(standing.watched).toBe(false);
  });

  it("says nothing new when the same add is lost again", () => {
    const store = createWriteFailureStore();

    const first = raiseLostAdd(null, { ...PLAIN, retry: noop }, store);
    const retried = raiseLostAdd(first, { ...PLAIN, retry: noop }, store);

    // One toast, and the *same* one — `AGENTS.md`: a retry that fails again has nothing
    // new to say, and a stack of identical toasts buries the title that was lost.
    expect(onScreen(store)).toEqual(["The Bear"]);
    expect(retried).toBe(first);
  });

  it("replaces the plain add's toast when the watched add is lost after it", () => {
    const store = createWriteFailureStore();
    const retried: string[] = [];

    const first = raiseLostAdd(
      null,
      { ...PLAIN, retry: () => retried.push("plain") },
      store,
    );
    const second = raiseLostAdd(
      first,
      { ...WATCHED, retry: () => retried.push("watched") },
      store,
    );

    // Still one toast — but it is the other one, and its *Try again* runs the write the
    // reader actually asked for last. Before this rule the guard returned here, the
    // plain add's toast stood, and pressing it added the title **without** the watches
    // and then resolved as a success.
    expect(onScreen(store)).toEqual(["The Bear"]);
    expect(second).not.toBe(first);
    expect(second.watched).toBe(true);
    expect(first.handle.standing()).toBe(false);

    store.get()[0].retry?.();
    expect(retried).toEqual(["watched"]);
  });

  it("replaces the watched add's toast when the plain add is lost after it", () => {
    const store = createWriteFailureStore();
    const retried: string[] = [];

    const first = raiseLostAdd(
      null,
      { ...WATCHED, retry: () => retried.push("watched") },
      store,
    );
    const second = raiseLostAdd(
      first,
      { ...PLAIN, retry: () => retried.push("plain") },
      store,
    );

    // The other ordering, and it is not symmetrical in what it achieves — retrying the
    // plain add gets the title without the watches. It is still right: that is the press
    // the reader made last, and it is the one in front of them to act on.
    expect(second.watched).toBe(false);
    store.get()[0].retry?.();
    expect(retried).toEqual(["plain"]);
  });

  it("raises again after the reader has dismissed the standing toast", () => {
    const store = createWriteFailureStore();

    const first = raiseLostAdd(null, { ...PLAIN, retry: noop }, store);
    store.dismiss(first.handle.id);

    const second = raiseLostAdd(first, { ...PLAIN, retry: noop }, store);

    // The blind spot `standing()` exists for (issue #113): a ref still holding a
    // dismissed handle would suppress the next lost write entirely.
    expect(onScreen(store)).toEqual(["The Bear"]);
    expect(second).not.toBe(first);
  });

  it("raises again after the caller resolved the last one", () => {
    const store = createWriteFailureStore();

    const first = raiseLostAdd(null, { ...WATCHED, retry: noop }, store);
    first.handle.resolve();

    const second: StandingAdd = raiseLostAdd(first, { ...WATCHED, retry: noop }, store);

    // A write that landed and was then lost on a later press is a new lost write, not a
    // repeat of one already on screen.
    expect(onScreen(store)).toEqual(["The Bear"]);
    expect(second).not.toBe(first);
  });

  it("carries the reference of the add it is about", () => {
    const store = createWriteFailureStore();

    const first = raiseLostAdd(null, { ...PLAIN, retry: noop }, store);
    raiseLostAdd(first, { ...WATCHED, retry: noop }, store);

    // The reference **is** the Sentry event id (`errors/reference.ts`), so a toast
    // standing for one write carrying another's id would send the reader to the wrong
    // event.
    expect(store.get().map((one) => one.reference)).toEqual(["ref-2"]);
  });
});
