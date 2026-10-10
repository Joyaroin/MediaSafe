import { describe, expect, it, vi } from "vitest";

import { startAgain, type ResumeOutcome } from "@/app/(signed-in)/you/start-again";
import { createWriteFailureStore, type WriteFailureHandle } from "@/errors/write-failure";

/**
 * Issue #373's *Start again*, held to the write-failure discipline: optimistic, one toast
 * per lost write, the tile put back, and a retry that lands resolving the toast.
 */

const show = { libraryEntryId: "entry-1", titleName: "Severance" };

function harness(outcomes: ResumeOutcome[]) {
  const failures = createWriteFailureStore();
  const shown = new Set([show.libraryEntryId]);
  const resume = vi.fn(async () => outcomes.shift() ?? { ok: true as const });
  const deps = {
    resume,
    failures,
    raised: new Map<string, WriteFailureHandle>(),
    hide: (id: string) => void shown.delete(id),
    restore: (id: string) => void shown.add(id),
  };
  return { failures, shown, resume, deps };
}

const lost: ResumeOutcome = { ok: false, reference: "8f2a1c6e4b7d4f3a9e0c5b1d2a3f4e5b" };

describe("Start again", () => {
  it("takes the tile off on the press, through the existing resume", async () => {
    const { shown, resume, deps, failures } = harness([]);
    let seenWhileInFlight: boolean | null = null;
    resume.mockImplementationOnce(async () => {
      seenWhileInFlight = shown.has(show.libraryEntryId);
      return { ok: true };
    });

    await startAgain(show, deps);

    expect(seenWhileInFlight).toBe(false);
    expect(shown.has(show.libraryEntryId)).toBe(false);
    expect(resume).toHaveBeenCalledWith("entry-1");
    expect(failures.get()).toEqual([]);
  });

  it("puts the tile back and raises one toast when the write is lost", async () => {
    const { shown, deps, failures } = harness([lost]);

    await startAgain(show, deps);

    expect(shown.has(show.libraryEntryId)).toBe(true);
    expect(failures.get()).toHaveLength(1);
    expect(failures.get()[0]).toMatchObject({ title: "Severance", reference: lost.reference });
  });

  it("raises nothing new when a retry is lost again", async () => {
    const { deps, failures } = harness([lost, lost]);

    await startAgain(show, deps);
    failures.get()[0].retry?.();
    await vi.waitFor(() => expect(deps.resume).toHaveBeenCalledTimes(2));

    expect(failures.get()).toHaveLength(1);
  });

  it("resolves the toast when a retry lands", async () => {
    const { shown, deps, failures } = harness([lost, { ok: true }]);

    await startAgain(show, deps);
    failures.get()[0].retry?.();
    await vi.waitFor(() => expect(failures.get()).toEqual([]));

    expect(shown.has(show.libraryEntryId)).toBe(false);
  });
});
