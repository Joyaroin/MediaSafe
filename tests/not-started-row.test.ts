import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UpNextNotStartedRow } from "@/app/(signed-in)/up-next/up-next-episode-row";
import { asUserId, listNotStartedShows } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * A Not started row, rendered from what the read returns — issue #603.
 *
 * A show whose lowest season has no episode 1 starts from its earliest aired episode
 * (`tests/not-started.test.ts` holds that rule). This holds the other half: the row says
 * so, with the real episode's code and name in "Start with S01 · E02 · {name}", rather than
 * assuming E01. The row is rendered with `renderToStaticMarkup` (vitest runs in `node`, no
 * DOM, as `tests/upcoming-surface.test.ts` does), on the entry the read produced.
 */

setUpTestDatabase("mediasafe_not_started_row_test");

const RELEASED = "2020-01-01";

async function seedShow(
  tx: Transaction,
  name: string,
  episodes: { seasonNo: number; episodeNo: number; name: string }[],
) {
  const id = `row-reader-${name}`;
  await tx.insert(user).values({ id, name: id, email: `${id}@example.test` });
  const [row] = await tx
    .insert(title)
    .values({ kind: "show", tmdbId: 9000 + name.length, name, releaseYear: 2022 })
    .returning({ id: title.id });
  let tmdbEpisodeId = 70000 + name.length * 100;
  for (const one of episodes) {
    await tx.insert(episode).values({
      titleId: row.id,
      tmdbEpisodeId: tmdbEpisodeId++,
      seasonNo: one.seasonNo,
      episodeNo: one.episodeNo,
      name: one.name,
      airDate: RELEASED,
    });
  }
  await tx.insert(libraryEntry).values({ userId: id, titleId: row.id });
  return asUserId(id);
}

function lineOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, "|").replace(/\|+/g, "|");
}

describe("the Not started row", () => {
  it("says Start with S01 · E02 · {name} for a show whose first season starts at episode 2", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedShow(tx, "Missing pilot", [
        { seasonNo: 1, episodeNo: 2, name: "The Second" },
        { seasonNo: 1, episodeNo: 3, name: "The Third" },
      ]);

      const [entry] = await listNotStartedShows(reader, 10, tx);
      // The read must have produced the episode-2 start, or the line below proves nothing.
      expect([entry.seasonNo, entry.episodeNo]).toEqual([1, 2]);
      expect(entry.queue.episodes.length).toBeGreaterThan(0);

      const markup = renderToStaticMarkup(createElement(UpNextNotStartedRow, { entry }));

      expect(lineOf(markup)).toContain("Start with S01 · E02 · The Second");
      expect(markup).not.toContain("E01");
      expect(markup).not.toMatch(/this season/);
    });
  });
});
