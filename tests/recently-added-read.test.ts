import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `readRecentlyAdded` (issue #598, backlog #588): a failed read is carried as data with
 * its reference, as `readRail`'s is in `search-rails.test.ts`, and an empty library is a
 * different thing — a read that succeeded and found nothing.
 */

vi.mock("server-only", () => ({}));

const reads = vi.hoisted(() => ({
  cachedRecentlyAdded: vi.fn(),
  referenceFor: vi.fn(),
}));

vi.mock("@/cache/tags", () => ({ cachedRecentlyAdded: reads.cachedRecentlyAdded }));
vi.mock("@/errors/reference", () => ({ referenceFor: reads.referenceFor }));

const { readRecentlyAdded } = await import("@/app/(signed-in)/search/recently-added-read");

const reader = "reader-1" as never;

beforeEach(() => {
  for (const mock of Object.values(reads)) mock.mockReset();
  reads.referenceFor.mockReturnValue("ref-42");
});

describe("readRecentlyAdded", () => {
  it("carries a failed read as data with the reference, never as an empty list", async () => {
    const failure = new Error("the database is down");
    reads.cachedRecentlyAdded.mockRejectedValue(failure);

    const outcome = await readRecentlyAdded(reader);

    expect(outcome).toEqual({ ok: false, reference: "ref-42" });
    expect(outcome).not.toHaveProperty("entries");
    expect(reads.referenceFor).toHaveBeenCalledWith(failure, { surface: "recently-added" });
  });

  it("answers an empty library as a successful read with no entries", async () => {
    reads.cachedRecentlyAdded.mockResolvedValue([]);

    expect(await readRecentlyAdded(reader)).toEqual({ ok: true, entries: [] });
    expect(reads.referenceFor).not.toHaveBeenCalled();
  });

  it("answers the entries it read", async () => {
    const entries = [{ titleId: "title-1" }];
    reads.cachedRecentlyAdded.mockResolvedValue(entries);

    expect(await readRecentlyAdded(reader)).toEqual({ ok: true, entries });
    expect(reads.cachedRecentlyAdded).toHaveBeenCalledWith(reader);
  });
});
