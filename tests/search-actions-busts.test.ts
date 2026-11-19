import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the search actions bust (issue #598, backlog #562).
 *
 * `tests/cache-tags.test.ts` checks the database functions' `INVALIDATES` entries, not
 * what the actions *call*. This file holds the calls. `@/cache/tags` and
 * `@/cache/borrowed-facts` are mocked, so the assertions are on write names and account
 * lists (`"markWatchedUndated"`, `"refreshTitleMirror"`), not on real cache tags; the
 * tag each write expands to is `cache-tags.test.ts`'s business.
 *
 * The rule under test is #219's: a bust runs only after its own write has landed. The
 * season fetch in `markSeenAllAction` is its own landed write, so its busts run even when
 * the undated write after it fails.
 *
 * `searchCatalogueAction` busts nothing (it only reads), so it has no case here.
 */

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  invalidateFor: vi.fn(),
  invalidateForOtherAccounts: vi.fn(),
  invalidateBorrowedFactsFor: vi.fn(),
  requireUserId: vi.fn(),
  referenceFor: vi.fn(),
  accountsHoldingTitles: vi.fn(),
  markWatchedUndated: vi.fn(),
  undoMarkWatchedUpTo: vi.fn(),
  addTitleAnswering: vi.fn(),
  finishMirrorIfPending: vi.fn(),
  titleRowMirror: vi.fn(),
  colourAfterAdd: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", () => ({ after: m.after }));
vi.mock("@/cache/tags", () => ({
  invalidateFor: m.invalidateFor,
  invalidateForOtherAccounts: m.invalidateForOtherAccounts,
}));
vi.mock("@/cache/borrowed-facts", () => ({
  invalidateBorrowedFactsFor: m.invalidateBorrowedFactsFor,
}));
vi.mock("@/lib/session", () => ({ requireUserId: m.requireUserId }));
vi.mock("@/errors/reference", () => ({ referenceFor: m.referenceFor }));
vi.mock("@/db/access", () => ({
  accountsHoldingTitles: m.accountsHoldingTitles,
  markWatchedUndated: m.markWatchedUndated,
  undoMarkWatchedUpTo: m.undoMarkWatchedUpTo,
  libraryCatalogueKeys: vi.fn(),
}));
vi.mock("@/tmdb/catalogue", () => ({
  searchCatalogueOfKind: vi.fn(),
  titleMirror: vi.fn(),
  titleRowMirror: m.titleRowMirror,
}));
vi.mock("@/app/api/cron/nightly-sweep/colour-after-add", () => ({
  colourAfterAdd: m.colourAfterAdd,
}));
vi.mock("@/app/(signed-in)/search/add-title", () => ({
  addTitleAnswering: m.addTitleAnswering,
  finishMirrorIfPending: m.finishMirrorIfPending,
}));

const { addToLibraryAction, markSeenAllAction, undoSeenAllAction } = await import(
  "@/app/(signed-in)/search/actions"
);

const reader = "reader-1";
const others = ["reader-2", "reader-3"];

function busts() {
  return {
    own: m.invalidateFor.mock.calls.map(([write, user]) => [write, user]),
    others: m.invalidateForOtherAccounts.mock.calls.map(([write, accounts, user]) => [
      write,
      accounts,
      user,
    ]),
    borrowed: m.invalidateBorrowedFactsFor.mock.calls.map(([keys]) => keys),
  };
}

function expectNoBusts() {
  expect(m.invalidateFor).not.toHaveBeenCalled();
  expect(m.invalidateForOtherAccounts).not.toHaveBeenCalled();
  expect(m.invalidateBorrowedFactsFor).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const mock of Object.values(m)) mock.mockReset();
  m.requireUserId.mockResolvedValue(reader);
  m.referenceFor.mockReturnValue("ref-7");
  m.accountsHoldingTitles.mockResolvedValue(others);
});

describe("addToLibraryAction", () => {
  const landed = () => {
    m.titleRowMirror.mockResolvedValue({});
    m.addTitleAnswering.mockResolvedValue({
      titleId: "title-1",
      mirrorEpisodes: async () => {},
      libraryEntryId: "entry-1",
      hasAiredEpisode: true,
    });
  };

  it("busts the reader's library, the other holders' and the title's borrowed facts once the add has landed", async () => {
    landed();

    expect(await addToLibraryAction("show", 1396)).toEqual({
      ok: true,
      libraryEntryId: "entry-1",
      hasAiredEpisode: true,
    });

    expect(m.accountsHoldingTitles).toHaveBeenCalledWith(["title-1"]);
    expect(busts()).toEqual({
      own: [["addTitleToLibrary", reader]],
      others: [["addTitleToLibrary", others, reader]],
      borrowed: [[{ kind: "show", tmdbId: 1396 }]],
    });
  });

  it("busts nothing when the add is lost, and answers with the reference", async () => {
    m.titleRowMirror.mockResolvedValue({});
    m.addTitleAnswering.mockRejectedValue(new Error("the database is down"));

    expect(await addToLibraryAction("show", 1396)).toEqual({ ok: false, reference: "ref-7" });

    expectNoBusts();
  });

  it("busts nothing when the catalogue key is tampered with", async () => {
    expect(await addToLibraryAction("show", -1)).toEqual({ ok: false, reference: "ref-7" });

    expect(m.addTitleAnswering).not.toHaveBeenCalled();
    expectNoBusts();
  });
});

describe("markSeenAllAction", () => {
  it("busts the undated write, and the title mirror's own and others', when both writes land", async () => {
    m.finishMirrorIfPending.mockResolvedValue({ mirroredTitleId: "title-1" });
    m.markWatchedUndated.mockResolvedValue(undefined);

    expect(await markSeenAllAction("entry-1", "key-1")).toEqual({ ok: true });

    expect(m.markWatchedUndated).toHaveBeenCalledWith(reader, {
      libraryEntryId: "entry-1",
      sourceKey: "key-1",
    });
    expect(m.accountsHoldingTitles).toHaveBeenCalledWith(["title-1"]);
    expect(busts().own).toEqual(
      expect.arrayContaining([
        ["markWatchedUndated", reader],
        ["refreshTitleMirror", reader],
      ]),
    );
    expect(busts().own).toHaveLength(2);
    expect(busts().others).toEqual([["refreshTitleMirror", others, reader]]);
    expect(busts().borrowed).toEqual([]);
  });

  it("busts only the undated write when no seasons were pending", async () => {
    m.finishMirrorIfPending.mockResolvedValue({ mirroredTitleId: null });
    m.markWatchedUndated.mockResolvedValue(undefined);

    expect(await markSeenAllAction("entry-1", "key-1")).toEqual({ ok: true });

    expect(busts()).toEqual({
      own: [["markWatchedUndated", reader]],
      others: [],
      borrowed: [],
    });
    expect(m.accountsHoldingTitles).not.toHaveBeenCalled();
  });

  it("still busts both refreshTitleMirror entries, and not markWatchedUndated, when the seasons landed and the undated write then failed", async () => {
    m.finishMirrorIfPending.mockResolvedValue({ mirroredTitleId: "title-1" });
    m.markWatchedUndated.mockRejectedValue(new Error("the database is down"));

    expect(await markSeenAllAction("entry-1", "key-1")).toEqual({
      ok: false,
      reference: "ref-7",
    });

    // The write really was attempted, so the failure is the undated write's.
    expect(m.markWatchedUndated).toHaveBeenCalledTimes(1);
    expect(busts()).toEqual({
      own: [["refreshTitleMirror", reader]],
      others: [["refreshTitleMirror", others, reader]],
      borrowed: [],
    });
  });

  it("busts nothing when the season fetch itself fails", async () => {
    m.finishMirrorIfPending.mockRejectedValue(new Error("TMDB is unreachable"));

    expect(await markSeenAllAction("entry-1", "key-1")).toEqual({
      ok: false,
      reference: "ref-7",
    });

    expect(m.markWatchedUndated).not.toHaveBeenCalled();
    expectNoBusts();
  });

  it("busts nothing when no seasons were pending and the undated write fails", async () => {
    m.finishMirrorIfPending.mockResolvedValue({ mirroredTitleId: null });
    m.markWatchedUndated.mockRejectedValue(new Error("the database is down"));

    expect(await markSeenAllAction("entry-1", "key-1")).toEqual({
      ok: false,
      reference: "ref-7",
    });

    expectNoBusts();
  });
});

describe("undoSeenAllAction", () => {
  it("busts the reader's undo once it has landed", async () => {
    m.undoMarkWatchedUpTo.mockResolvedValue(undefined);

    expect(await undoSeenAllAction("entry-1", "key-1")).toEqual({ ok: true });

    expect(m.undoMarkWatchedUpTo).toHaveBeenCalledWith(reader, {
      libraryEntryId: "entry-1",
      sourceKey: "key-1",
    });
    expect(busts()).toEqual({
      own: [["undoMarkWatchedUpTo", reader]],
      others: [],
      borrowed: [],
    });
  });

  it("busts nothing when the undo fails", async () => {
    m.undoMarkWatchedUpTo.mockRejectedValue(new Error("the database is down"));

    expect(await undoSeenAllAction("entry-1", "key-1")).toEqual({
      ok: false,
      reference: "ref-7",
    });

    expectNoBusts();
  });
});
