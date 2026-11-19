import { describe, expect, it } from "vitest";

import type {
  MarkWatchedUpToActionOutcome,
  UnwatchActionOutcome,
  WatchActionOutcome,
} from "@/app/(signed-in)/library/watch-action";
import { createWatchMarks } from "@/app/(signed-in)/library/watch-marks";
import { startWithInWords } from "@/app/(signed-in)/up-next/episode-card-line";
import {
  NOT_STARTED_ON_TONIGHT,
  NOT_STARTED_READ_SIZE,
  placeNotStarted,
} from "@/app/(signed-in)/up-next/not-started";
import {
  markFromCard,
  stillNotStarted,
  stillOnRail,
  undoFromCard,
} from "@/app/(signed-in)/up-next/up-next-mark";
import type { QueuedEpisode, UpNextEntry } from "@/db/access";
import { createWriteFailureStore } from "@/errors/write-failure";

/**
 * Tonight's Not started group — the surface's rules (issue #551), with no DOM, as
 * `up-next-card-mark.test.ts` does for the cards: where the shows go (featured or group),
 * when a row closes, and the line it reads. The rendered behaviour is
 * `tests/e2e/tonight-not-started.spec.ts`.
 */

function episodeAt(seasonNo: number, episodeNo: number, name: string): QueuedEpisode {
  return {
    episodeId: `episode-${seasonNo}-${episodeNo}`,
    episodeName: name,
    seasonNo,
    episodeNo,
    lastAiredInSeason: false,
    seasonAiring: false,
    lastOfShow: false,
    seasonReleased: 8,
    stillPath: null,
  };
}

function show(id: string, episodes: readonly QueuedEpisode[]): UpNextEntry {
  return {
    libraryEntryId: id,
    titleId: `title-${id}`,
    titleName: `Show ${id}`,
    releaseYear: 2024,
    posterPath: null,
    episodeId: episodes[0]?.episodeId ?? "none",
    episodeName: episodes[0]?.episodeName ?? null,
    seasonNo: 1,
    episodeNo: 1,
    airDate: "2024-01-01",
    runtimeMins: 40,
    stillPath: null,
    inProduction: true,
    posterColour: null,
    seasonWatched: 0,
    seasonReleased: 8,
    queue: { episodes, more: false },
  };
}

const PILOT = episodeAt(1, 1, "Pilot");
const SECOND = episodeAt(1, 2, "Second");

function harness() {
  const answerRecord: Array<(outcome: WatchActionOutcome) => void> = [];
  const marks = createWatchMarks({
    writer: {
      record() {
        return new Promise((resolve) => answerRecord.push(resolve));
      },
      remove() {
        return new Promise<UnwatchActionOutcome>(() => {});
      },
      undo() {
        return new Promise<UnwatchActionOutcome>(() => {});
      },
      recordUpTo(): Promise<MarkWatchedUpToActionOutcome> {
        throw new Error("never");
      },
      undoUpTo(): Promise<UnwatchActionOutcome> {
        throw new Error("never");
      },
    },
    failures: createWriteFailureStore(),
    mintKey: () => "key",
  });
  return { marks, answerRecord };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("where the Not started shows go", () => {
  const four = ["a", "b", "c", "d"].map((id) => show(id, [PILOT, SECOND]));
  const watching = [show("w", [SECOND])];

  it("keeps three in the group, and none featured, while Continue watching has an entry", () => {
    const placed = placeNotStarted(watching, four, false);
    expect(placed.featured).toBeNull();
    expect(placed.group.map((entry) => entry.libraryEntryId)).toEqual(["a", "b", "c"]);
  });

  it("features the first, and leaves it out of the group, when nothing is in Continue watching on load", () => {
    const placed = placeNotStarted([], four, true);
    expect(placed.featured?.libraryEntryId).toBe("a");
    expect(placed.group.map((entry) => entry.libraryEntryId)).toEqual(["b", "c", "d"]);
  });

  it("never swaps a Not started show in after the load found Continue watching occupied", () => {
    // The reader marked the last Continue watching show away: the render that follows has
    // none, and the spec has the new featured show wait for the next load.
    const placed = placeNotStarted([], four, false);
    expect(placed.featured).toBeNull();
    expect(placed.group).toHaveLength(NOT_STARTED_ON_TONIGHT);
  });

  it("stops featuring once the featured show is in Continue watching", () => {
    const placed = placeNotStarted([show("a", [SECOND])], four.slice(1), true);
    expect(placed.featured).toBeNull();
  });

  it("reads one more than the group holds, for the featured slot", () => {
    expect(NOT_STARTED_READ_SIZE).toBe(NOT_STARTED_ON_TONIGHT + 1);
  });
});

describe("a Not started row's life", () => {
  it("stays through the press and its hold, and closes when the hold ends", async () => {
    const { marks, answerRecord } = harness();
    const entry = show("a", [PILOT, SECOND]);
    const subject = { libraryEntryId: "a", episodeId: PILOT.episodeId };

    expect(stillNotStarted(marks, "a", entry.queue)).toBe(true);

    void markFromCard(marks, entry, PILOT);
    await settle();
    // Marking S1 E1 spends nothing of the run, so the Also ready rule would keep the row...
    expect(stillOnRail(marks, "a", entry.queue)).toBe(true);
    // ...and this one holds it only while the mark is `marking`.
    expect(stillNotStarted(marks, "a", entry.queue)).toBe(true);

    answerRecord[0]({ ok: true });
    await settle();
    marks.settle(subject);
    expect(stillNotStarted(marks, "a", entry.queue)).toBe(false);
    expect(stillOnRail(marks, "a", entry.queue)).toBe(true);
  });

  it("stays when the mark is taken back", async () => {
    const { marks, answerRecord } = harness();
    const entry = show("a", [PILOT, SECOND]);

    void markFromCard(marks, entry, PILOT);
    await settle();
    answerRecord[0]({ ok: true });
    await settle();
    void undoFromCard(marks, entry, PILOT);
    await settle();

    expect(stillNotStarted(marks, "a", entry.queue)).toBe(true);
  });

  it("stays when its run arrived empty", () => {
    const { marks } = harness();
    expect(stillNotStarted(marks, "a", show("a", []).queue)).toBe(true);
  });
});

describe("the line", () => {
  it("reads Start with the code and the episode's name, and no season count", () => {
    expect(startWithInWords(1, 1, "Pilot")).toBe("Start with S01 · E01 · Pilot");
    expect(startWithInWords(1, 1, "Pilot")).not.toMatch(/this season|remaining/);
  });

  it("reads without a name when TMDB has none", () => {
    expect(startWithInWords(2, 1, null)).toBe("Start with S02 · E01");
  });
});
