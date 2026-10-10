import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RecentWatch } from "@/db/access";

/**
 * You's *Recently watched* section as the reader meets it — issue #371. The read itself is
 * held against Postgres in `tests/you-recent-watches.test.ts`; this is the section over it.
 */

const { reads } = vi.hoisted(() => ({
  reads: { listRecentWatches: vi.fn(), requireTimezone: vi.fn() },
}));

vi.mock("@/db/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/access")>()),
  listRecentWatches: reads.listRecentWatches,
}));
vi.mock("@/lib/session", () => ({ requireTimezone: reads.requireTimezone }));

const { asUserId } = await import("@/db/access");
const { RecentlyWatched, RecentlyWatchedSection } = await import(
  "@/app/(signed-in)/you/recently-watched"
);

const now = new Date("2026-10-10T12:00:00Z");

function aWatch(overrides: Partial<RecentWatch> = {}): RecentWatch {
  return {
    watchId: "watch-1",
    libraryEntryId: "entry-1",
    titleName: "Severance",
    posterPath: null,
    seasonNo: 2,
    episodeNo: 4,
    episodeName: "Woe's Hollow",
    watchedAt: new Date("2026-10-10T09:00:00Z"),
    ...overrides,
  };
}

const render = (watches: readonly RecentWatch[]) =>
  renderToStaticMarkup(createElement(RecentlyWatched, { watches, zone: "UTC", now }));

describe("Recently watched", () => {
  it("is absent — no heading, no reserved space — when there is no dated watch", () => {
    expect(render([])).toBe("");
  });

  it("prints the title, the episode code and name, and the day, linking to the title page", () => {
    const markup = render([aWatch()]);

    expect(markup).toContain("Recently watched");
    expect(markup).toContain("Severance");
    expect(markup).toContain("S02 · E04 · Woe&#x27;s Hollow");
    expect(markup).toContain(">Today<");
    expect(markup).toContain('href="/titles/entry-1"');
  });

  it("says Film for a film, and the code alone for an unnamed episode", () => {
    const markup = render([
      aWatch({ watchId: "a", seasonNo: null, episodeNo: null, episodeName: null }),
      aWatch({ watchId: "b", episodeName: null }),
    ]);

    expect(markup).toContain(">Film<");
    expect(markup).toContain(">S02 · E04<");
  });

  it("keeps the order it was given, newest first", () => {
    const markup = render([
      aWatch({ watchId: "new", titleName: "Newer" }),
      aWatch({ watchId: "old", titleName: "Older", watchedAt: new Date("2026-10-09T09:00:00Z") }),
    ]);

    expect(markup.indexOf("Newer")).toBeLessThan(markup.indexOf("Older"));
    expect(markup).toContain(">Yesterday<");
  });
});

describe("a failed read is not an empty section", () => {
  it("lets the rejection through to the read-failure boundary", async () => {
    const unreachable = new Error("the database is unreachable");
    reads.listRecentWatches.mockRejectedValueOnce(unreachable);
    reads.requireTimezone.mockResolvedValueOnce("UTC");

    await expect(RecentlyWatchedSection({ userId: asUserId("user_mine") })).rejects.toThrow(
      unreachable,
    );
  });
});
