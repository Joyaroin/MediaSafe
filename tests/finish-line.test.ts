import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finishesSomething,
  finishFactsFor,
  finishLine,
  leavesFor,
} from "@/app/(signed-in)/up-next/finish-line";
import {
  beginHoldOver,
  holdingOver,
  holdOverWhile,
} from "@/app/(signed-in)/up-next/hold-over";
import type { QueuedEpisode } from "@/db/access";

/**
 * The finish moment's copy — issue #367 — as the table the issue asks for:
 * (season airing?, series ended?, last episode?) → what the hold says.
 */
describe("the line a card holds on after a mark", () => {
  it.each([
    // lastEpisode, seasonAiring, seriesEnded, line
    [false, false, false, "Watched"],
    [false, true, false, "Watched"],
    [false, false, true, "Watched"],
    [false, true, true, "Watched"],
    [true, true, false, "All caught up"],
    [true, false, false, "Season 2 done"],
    [true, false, true, "That's the show"],
    [true, true, true, "That's the show"],
  ])(
    "last episode %s, season airing %s, series ended %s → %s",
    (lastEpisode, seasonAiring, seriesEnded, line) => {
      expect(finishLine({ seasonNo: 2, lastEpisode, seasonAiring, seriesEnded })).toBe(line);
    },
  );
});

function queued(facts: Partial<QueuedEpisode>): QueuedEpisode {
  return {
    episodeId: "episode",
    episodeName: "Episode",
    seasonNo: 3,
    episodeNo: 8,
    lastAiredInSeason: false,
    seasonAiring: false,
    lastOfShow: false,
    seasonReleased: 10,
    stillPath: null,
    ...facts,
  };
}

describe("the facts a queued episode gives the line", () => {
  it("ends the series only when TMDB says it has ended and nothing follows", () => {
    const last = queued({ lastAiredInSeason: true, lastOfShow: true });

    expect(finishLine(finishFactsFor({ inProduction: false }, last))).toBe("That's the show");
    // Still in production, or not said: the last episode there is is a season done.
    expect(finishLine(finishFactsFor({ inProduction: true }, last))).toBe("Season 3 done");
    expect(finishLine(finishFactsFor({ inProduction: null }, last))).toBe("Season 3 done");
  });

  it("keeps an ended show's mid-run finale a season, not the show", () => {
    const finale = queued({ lastAiredInSeason: true, lastOfShow: false });

    expect(finishLine(finishFactsFor({ inProduction: false }, finale))).toBe("Season 3 done");
  });

  it("is a finish moment, haptic included, only when the line is not plain Watched", () => {
    expect(finishesSomething({ inProduction: true }, queued({}))).toBe(false);
    expect(
      finishesSomething(
        { inProduction: true },
        queued({ lastAiredInSeason: true, seasonAiring: true }),
      ),
    ).toBe(true);
  });
});

/** Handoff §11.2, issue #407: where a finished show's poster travels as its row leaves. */
describe("the tab a finished show leaves Tonight for", () => {
  it("is Library when the show has nothing left — the line says *That's the show*", () => {
    const last = queued({ lastAiredInSeason: true, lastOfShow: true });

    expect(leavesFor({ inProduction: false }, last)).toBe("/library");
  });

  it("is Coming up when more may yet air — a season done, or all caught up", () => {
    expect(leavesFor({ inProduction: true }, queued({ lastAiredInSeason: true, lastOfShow: true }))).toBe(
      "/coming-up",
    );
    expect(leavesFor({ inProduction: null }, queued({ lastAiredInSeason: true, lastOfShow: true }))).toBe(
      "/coming-up",
    );
    expect(
      leavesFor({ inProduction: true }, queued({ lastAiredInSeason: true, seasonAiring: true })),
    ).toBe("/coming-up");
    // An ended show's mid-run finale still has a season to come.
    expect(leavesFor({ inProduction: false }, queued({ lastAiredInSeason: true }))).toBe(
      "/coming-up",
    );
  });
});

/**
 * The hold-over that keeps a finishing card on screen while the server's re-render, which
 * no longer has it, is already in hand — `hold-over.tsx`. Its count is what `HoldOver`
 * reads; the browser half is `tests/e2e/up-next-finish-moment.spec.ts`.
 */
describe("holding Watching over a hold and its writes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds while any hold or write is open, and lets go when the last one ends", async () => {
    expect(holdingOver()).toBe(false);

    const release = beginHoldOver();
    let land!: () => void;
    const write = holdOverWhile(new Promise<void>((resolve) => (land = resolve)));
    release();
    release(); // A second release is a no-op.
    expect(holdingOver()).toBe(true);

    land();
    await write;
    // Settled, but its render has not landed: still held, for the length of the wait.
    expect(holdingOver()).toBe(true);
    vi.advanceTimersByTime(1_500);
    expect(holdingOver()).toBe(false);
  });

  it("lets go when a failed write's wait runs out, too", async () => {
    await expect(holdOverWhile(Promise.reject(new Error("lost")))).rejects.toThrow("lost");
    expect(holdingOver()).toBe(true);
    vi.advanceTimersByTime(1_500);
    expect(holdingOver()).toBe(false);
  });
});
