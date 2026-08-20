import { describe, expect, it } from "vitest";

import {
  createBulkSelection,
  type SelectableTitle,
} from "@/app/(signed-in)/library/bulk-selection";
import type { AddTitlesToListActionOutcome } from "@/app/(signed-in)/lists/actions";
import { createWriteFailureStore } from "@/errors/write-failure";

/**
 * Hold to select, and add the held titles to a list — issue #197, against
 * `app/(signed-in)/library/bulk-selection.ts`.
 *
 * ── Why every assertion here is against the store and none against a cell ────────────
 *
 * The suite is `environment: "node"` (`vitest.config.mts`) and a library cell is a poster,
 * a `pointerdown` and a 500ms timer — none of which exist here. That is not a gap this
 * file works around; it is the reason the store exists at all. Issue #197: *the cells stay
 * thin. This is deliberate: the tiles cannot be rendered in the test harness, so keeping
 * logic out of them is what makes any of it testable.*
 *
 * So the four rules the ticket names — what is selected, that emptying ends the mode, that
 * the write is all-or-nothing, and that one lost bulk write raises exactly one toast — are
 * all properties of this factory, driven directly, with the writer and the toast store
 * handed in exactly as `tests/watch-marks.test.ts` hands them to `createWatchMarks`.
 *
 * ── No network, no clock ─────────────────────────────────────────────────────────────
 *
 * Every write below is a promise this file resolves by hand, which is what makes *while
 * the add is still in flight* something a test can express. That the write really is one
 * transaction is Postgres's to prove and `tests/lists.test.ts` proves it; what this file
 * proves is that the browser only ever asks for one.
 */

const SEVERANCE: SelectableTitle = {
  libraryEntryId: "entry-severance",
  titleId: "title-severance",
  name: "Severance",
};

const ANDOR: SelectableTitle = {
  libraryEntryId: "entry-andor",
  titleId: "title-andor",
  name: "Andor",
};

const SHOGUN: SelectableTitle = {
  libraryEntryId: "entry-shogun",
  titleId: "title-shogun",
  name: "Shōgun",
};

function harness() {
  /** Every call the writer took, in order — one entry per bulk write, never one per title. */
  const writes: Array<{ listId: string; titleIds: readonly string[] }> = [];
  const answer: Array<(outcome: AddTitlesToListActionOutcome) => void> = [];

  const failures = createWriteFailureStore();
  const selection = createBulkSelection({
    writer: {
      add(params) {
        writes.push({ listId: params.listId, titleIds: params.titleIds });
        return new Promise((resolve) => answer.push(resolve));
      },
    },
    failures,
  });

  /** What a surface renders, and how often it was told to re-read. */
  function surface() {
    let renders = 0;
    const unsubscribe = selection.subscribe(() => {
      renders += 1;
    });
    return {
      unsubscribe,
      get renders() {
        return renders;
      },
    };
  }

  return { selection, failures, writes, answer, surface };
}

/** The names of what is selected, in selection order. */
function names(selection: ReturnType<typeof harness>["selection"]): string[] {
  return selection.read().selected.map((title) => title.name);
}

/** The one lost write on screen, or `undefined` — the toast's own view of the world. */
function onlyToast(failures: ReturnType<typeof createWriteFailureStore>) {
  const raised = failures.get();
  expect(raised.length).toBeLessThanOrEqual(1);
  return raised[0];
}

describe("entering and leaving the mode", () => {
  it("is not selecting until a cell is held", () => {
    const { selection } = harness();

    expect(selection.read().selecting).toBe(false);
    expect(selection.read().selected).toEqual([]);
  });

  it("enters the mode with the held title already selected", () => {
    const { selection } = harness();

    selection.hold(SEVERANCE);

    expect(selection.read().selecting).toBe(true);
    expect(names(selection)).toEqual(["Severance"]);
    expect(selection.isSelected(SEVERANCE.libraryEntryId)).toBe(true);
  });

  it("adds a tapped title and removes it when it is tapped again", () => {
    const { selection } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(ANDOR);

    expect(names(selection)).toEqual(["Severance", "Andor"]);

    selection.toggle(ANDOR);

    expect(names(selection)).toEqual(["Severance"]);
    expect(selection.isSelected(ANDOR.libraryEntryId)).toBe(false);
    // Still selecting: one title is left, so there is still something to act on.
    expect(selection.read().selecting).toBe(true);
  });

  it("ends the mode when the last selected title is deselected", () => {
    const { selection } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(SEVERANCE);

    expect(selection.read().selecting).toBe(false);
    expect(selection.read().selected).toEqual([]);
  });

  it("ignores a tap outside the mode, so a plain click is never a selection", () => {
    const { selection } = harness();

    selection.toggle(SEVERANCE);

    expect(selection.read().selecting).toBe(false);
    expect(selection.read().selected).toEqual([]);
  });

  it("ends the mode and clears the selection on Done", () => {
    const { selection } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(ANDOR);
    selection.end();

    expect(selection.read().selecting).toBe(false);
    expect(selection.read().selected).toEqual([]);
  });

  it("holding a title already selected leaves it selected rather than removing it", () => {
    const { selection } = harness();

    selection.hold(SEVERANCE);
    selection.hold(SEVERANCE);

    expect(names(selection)).toEqual(["Severance"]);
    expect(selection.read().selecting).toBe(true);
  });

  it("tells every subscriber once per change, and hands back the same snapshot when nothing changed", () => {
    const { selection, surface } = harness();
    const bar = surface();
    const cell = surface();

    selection.hold(SEVERANCE);

    expect(bar.renders).toBe(1);
    expect(cell.renders).toBe(1);

    const before = selection.read();
    // Outside the mode this is a no-op; inside it, a tap on nothing. Either way a fresh
    // snapshot would re-render `useSyncExternalStore` for ever.
    selection.end();
    selection.end();

    expect(selection.read()).not.toBe(before);
    expect(bar.renders).toBe(2);

    bar.unsubscribe();
    selection.hold(ANDOR);
    expect(bar.renders).toBe(2);
    expect(cell.renders).toBe(3);
  });
});

describe("adding the selection to a list", () => {
  it("asks for one write carrying every selected title, not one write per title", async () => {
    const { selection, writes, answer } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(ANDOR);
    selection.toggle(SHOGUN);

    const landing = selection.addToList("list-1");

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      listId: "list-1",
      titleIds: ["title-severance", "title-andor", "title-shogun"],
    });

    answer[0]({ ok: true, added: 3 });
    await landing;
  });

  it("marks the write in flight so the bar's own control cannot be pressed twice", async () => {
    const { selection, writes, answer } = harness();

    selection.hold(SEVERANCE);
    const landing = selection.addToList("list-1");

    expect(selection.read().adding).toBe(true);

    void selection.addToList("list-1");
    expect(writes).toHaveLength(1);

    answer[0]({ ok: true, added: 1 });
    await landing;

    expect(selection.read().adding).toBe(false);
  });

  it("clears the selection and ends the mode once the write lands", async () => {
    const { selection, answer } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(ANDOR);

    const landing = selection.addToList("list-1");
    answer[0]({ ok: true, added: 2 });

    await expect(landing).resolves.toBe(true);
    expect(selection.read().selecting).toBe(false);
    expect(selection.read().selected).toEqual([]);
  });

  it("counts a title already in the list as a landed write rather than a failure", async () => {
    const { selection, answer } = harness();

    selection.hold(SEVERANCE);

    const landing = selection.addToList("list-1");
    // Every selected title was already there, so the transaction wrote nothing. That is
    // the list already saying what the reader asked it to say.
    answer[0]({ ok: true, added: 0 });

    await expect(landing).resolves.toBe(true);
    expect(selection.read().selecting).toBe(false);
  });

  it("adds nothing when nothing is selected", async () => {
    const { selection, writes } = harness();

    await expect(selection.addToList("list-1")).resolves.toBe(false);
    expect(writes).toEqual([]);
  });
});

describe("a lost bulk write", () => {
  it("raises exactly one toast for six lost titles, naming all of them", async () => {
    const { selection, failures, answer } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(ANDOR);
    selection.toggle(SHOGUN);

    const landing = selection.addToList("list-1");
    answer[0]({ ok: false, reference: "ref-1" });

    await expect(landing).resolves.toBe(false);

    const toast = onlyToast(failures);
    expect(toast).toBeDefined();
    expect(toast.title).toBe("Severance, Andor, Shōgun");
    expect(toast.reference).toBe("ref-1");
  });

  it("leaves the selection and the mode exactly as they were, so nothing is half-added", async () => {
    const { selection, answer } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(ANDOR);

    const landing = selection.addToList("list-1");
    answer[0]({ ok: false, reference: null });
    await landing;

    expect(selection.read().selecting).toBe(true);
    expect(names(selection)).toEqual(["Severance", "Andor"]);
    expect(selection.read().adding).toBe(false);
  });

  it("raises one toast per lost write, not one per attempt", async () => {
    const { selection, failures, answer } = harness();

    selection.hold(SEVERANCE);

    const first = selection.addToList("list-1");
    answer[0]({ ok: false, reference: "ref-1" });
    await first;

    const second = selection.addToList("list-1");
    answer[1]({ ok: false, reference: "ref-2" });
    await second;

    expect(failures.get()).toHaveLength(1);
    expect(onlyToast(failures).reference).toBe("ref-1");
  });

  it("raises a second toast once the reader has dismissed the first", async () => {
    const { selection, failures, answer } = harness();

    selection.hold(SEVERANCE);

    const first = selection.addToList("list-1");
    answer[0]({ ok: false, reference: "ref-1" });
    await first;

    failures.dismiss(onlyToast(failures).id);

    const second = selection.addToList("list-1");
    answer[1]({ ok: false, reference: "ref-2" });
    await second;

    expect(onlyToast(failures).reference).toBe("ref-2");
  });

  it("retries the same set of titles from the toast, and takes the toast down when it lands", async () => {
    const { selection, failures, writes, answer } = harness();

    selection.hold(SEVERANCE);
    selection.toggle(ANDOR);

    const first = selection.addToList("list-1");
    answer[0]({ ok: false, reference: "ref-1" });
    await first;

    const raised = onlyToast(failures);
    expect(raised.retry).toBeDefined();

    raised.retry?.();
    expect(writes[1]).toEqual({
      listId: "list-1",
      titleIds: ["title-severance", "title-andor"],
    });

    answer[1]({ ok: true, added: 2 });
    // The retry's own promise is not handed back through the toast, so this waits on the
    // microtask queue the way the toast's caller does.
    await Promise.resolve();
    await Promise.resolve();

    expect(failures.get()).toEqual([]);
    expect(selection.read().selecting).toBe(false);
  });

  it("does not clear a selection the reader has changed since the lost write", async () => {
    const { selection, failures, answer } = harness();

    selection.hold(SEVERANCE);

    const first = selection.addToList("list-1");
    answer[0]({ ok: false, reference: "ref-1" });
    await first;

    // A different set now — the reader carried on choosing while the toast stood.
    selection.toggle(ANDOR);

    onlyToast(failures).retry?.();
    answer[1]({ ok: true, added: 1 });
    await Promise.resolve();
    await Promise.resolve();

    // The old write landed and its toast is gone, but the mode belongs to the new
    // selection and finishing an older job must not end it.
    expect(failures.get()).toEqual([]);
    expect(selection.read().selecting).toBe(true);
    expect(names(selection)).toEqual(["Severance", "Andor"]);
  });

  it("turns a request that never reached the server into the same one toast", async () => {
    const failures = createWriteFailureStore();
    const selection = createBulkSelection({
      writer: {
        add: () => Promise.reject(new Error("offline")),
      },
      failures,
    });

    selection.hold(SEVERANCE);
    await expect(selection.addToList("list-1")).resolves.toBe(false);

    expect(onlyToast(failures).title).toBe("Severance");
    expect(selection.read().selecting).toBe(true);
  });
});
