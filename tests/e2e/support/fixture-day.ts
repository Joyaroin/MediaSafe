import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";

/**
 * Seeds one day of watching for the grouped-day spec (issue #539): `secondsAgo[i]` is the
 * age of the latest watch of title `i`, and a title's `episodes` are `[season, episode]`
 * pairs, each watched at or just before that instant. Written straight through the driver,
 * as `fixture-library.ts` is, because nothing in the app writes dated watches in bulk.
 *
 * Names carry a random token so a run's titles can't meet another run's.
 */
export interface SeededDayTitle {
  readonly titleName: string;
  readonly episodes: readonly (readonly [season: number, episode: number])[];
  /** Age of the latest watch, in seconds. */
  readonly secondsAgo: number;
}

export async function seedDayOfWatches(
  userId: string,
  titles: readonly SeededDayTitle[],
): Promise<void> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    for (const one of titles) {
      const tmdbId = Math.floor(Math.random() * 200_000_000);
      const [titleRow] = await db
        .insert(schema.title)
        .values({ kind: "show", tmdbId, name: one.titleName, releaseYear: 2024, inProduction: true })
        .returning({ id: schema.title.id });
      const [entryRow] = await db
        .insert(schema.libraryEntry)
        .values({ userId, titleId: titleRow.id })
        .returning({ id: schema.libraryEntry.id });

      for (const [index, [seasonNo, episodeNo]] of one.episodes.entries()) {
        const [episodeRow] = await db
          .insert(schema.episode)
          .values({
            titleId: titleRow.id,
            tmdbEpisodeId: tmdbId * 10 + index + 1,
            seasonNo,
            episodeNo,
            name: `Episode ${seasonNo}-${episodeNo}`,
            airDate: "2024-01-01",
          })
          .returning({ id: schema.episode.id });

        // The last episode listed is the latest watch; earlier ones a few seconds before.
        const behind = (one.episodes.length - 1 - index) * 5;
        await db.insert(schema.watch).values({
          userId,
          libraryEntryId: entryRow.id,
          titleId: titleRow.id,
          episodeId: episodeRow.id,
          watchedAt: new Date(Date.now() - (one.secondsAgo + behind) * 1000),
          source: "e2e-fixture",
          sourceKey: randomUUID(),
        });
      }
    }
  } finally {
    await pool.end();
  }
}
