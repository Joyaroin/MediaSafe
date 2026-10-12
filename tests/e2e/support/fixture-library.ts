import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";

/**
 * Seeds one title the poster-morph specs (issue #305) open, directly through the driver —
 * `fixture-session.ts`'s own reasoning applies unchanged: nothing here is reachable from
 * application code, and it has to write rows no application write path would, for an
 * account no read here ever pretends is real user data.
 *
 * ── A show, watched partway, rather than a film or an unwatched one ─────────────────────
 *
 * The library grid opens from any state, but the Up next rail's "next episodes" list —
 * `up-next-episode-rail.tsx`, `press="episode"`, the second entry path this ticket's
 * acceptance criteria name — only ever lists a title standing at *watching*
 * (`db/access.ts`'s `ONGOING_RAIL_SIZE` slice, `db/views.ts`'s `library_entry_state`). One
 * seed answers both: two aired episodes, the first watched and the second not, is the
 * minimum shape that state requires. Seeding one show once and opening it from both
 * surfaces, in two separate tests, is what proves the morph pairs on both entry paths —
 * a single seed that only one test ever opened would leave the other path unproven.
 */
export interface SeededTitle {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly posterPath: string;
}

export async function seedWatchingShow(userId: string): Promise<SeededTitle> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    const unique = randomUUID();
    const titleName = `E2E Fixture Show ${unique}`;
    const posterPath = `/e2e-fixture-${unique}.jpg`;
    // `tmdb_id` is unique per `kind`, not globally — a random value collides with an
    // existing row only by coincidence this run's throwaway database never has to survive.
    // Capped well under `integer`'s 2^31-1 ceiling because the two episode ids below are
    // derived from it (`tmdbId * 10 + 1/2`) and still have to fit the same column.
    const tmdbId = Math.floor(Math.random() * 200_000_000);

    const [titleRow] = await db
      .insert(schema.title)
      .values({
        kind: "show",
        tmdbId,
        name: titleName,
        releaseYear: 2024,
        posterPath,
        inProduction: true,
      })
      .returning({ id: schema.title.id });

    const airedYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [watchedEpisode] = await db
      .insert(schema.episode)
      .values({
        titleId: titleRow.id,
        tmdbEpisodeId: tmdbId * 10 + 1,
        seasonNo: 1,
        episodeNo: 1,
        name: "Pilot",
        airDate: airedYesterday,
      })
      .returning({ id: schema.episode.id });

    // The second, unwatched episode — without it the title reads as *caught up*, not
    // *watching*, and never queues on Up next at all.
    await db.insert(schema.episode).values({
      titleId: titleRow.id,
      tmdbEpisodeId: tmdbId * 10 + 2,
      seasonNo: 1,
      episodeNo: 2,
      name: "The Second One",
      airDate: airedYesterday,
    });

    const [entryRow] = await db
      .insert(schema.libraryEntry)
      .values({ userId, titleId: titleRow.id })
      .returning({ id: schema.libraryEntry.id });

    await db.insert(schema.watch).values({
      userId,
      libraryEntryId: entryRow.id,
      titleId: titleRow.id,
      episodeId: watchedEpisode.id,
      watchedAt: new Date(),
      source: "e2e-fixture",
      sourceKey: randomUUID(),
    });

    return { libraryEntryId: entryRow.id, titleName, posterPath };
  } finally {
    await pool.end();
  }
}

/**
 * Seeds `count` films on the watchlist, each dated a day further into the future than the
 * last — the "Upcoming films" rail's own membership (`db/access.ts`'s `listUpcomingFilms`:
 * *standing at Watchlist, a film, and a release date not before yesterday*). A library
 * entry with no `watch` row is watchlist by construction (`db/views.ts`'s
 * `library_entry_state`), so this writes no fourth table — a title, and a library entry,
 * and nothing else.
 *
 * ── Why a whole rail's worth, rather than one film ────────────────────────────────────
 *
 * Issue #323's browser spec is the one caller: it has to scroll the rail horizontally to
 * prove a re-press puts it back at its start, and one card has nowhere to scroll to. Six
 * `138px` cards plus the track's `12px` gaps overflow the `500px` phone viewport
 * `poster-morph.spec.ts` already standardises on, with room to spare.
 */
export async function seedWatchlistFilms(
  userId: string,
  count: number,
): Promise<readonly string[]> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    const names: string[] = [];

    for (let day = 1; day <= count; day += 1) {
      const unique = randomUUID();
      const titleName = `E2E Fixture Film ${unique}`;
      const releaseDate = new Date(Date.now() + day * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const [titleRow] = await db
        .insert(schema.title)
        .values({
          kind: "film",
          tmdbId: Math.floor(Math.random() * 200_000_000),
          name: titleName,
          releaseYear: new Date(releaseDate).getUTCFullYear(),
          releaseDate,
          posterPath: `/e2e-fixture-${unique}.jpg`,
        })
        .returning({ id: schema.title.id });

      await db.insert(schema.libraryEntry).values({ userId, titleId: titleRow.id });

      names.push(titleName);
    }

    return names;
  } finally {
    await pool.end();
  }
}

/**
 * A show with one season of `episodes` aired episodes, the first `watched` of them
 * watched — issue #357's title page needs a season with gaps to mark, where
 * `seedWatchingShow`'s two episodes are one watched and one not.
 */
export async function seedShowWithSeason(
  userId: string,
  { episodes, watched }: { readonly episodes: number; readonly watched: readonly number[] },
): Promise<SeededTitle> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    const unique = randomUUID();
    const titleName = `E2E Fixture Season ${unique}`;
    const posterPath = `/e2e-fixture-${unique}.jpg`;
    // Capped so `tmdbId * 100 + episode` still fits `integer` (2^31 - 1); at 200M it
    // overflowed about nine runs in ten.
    const tmdbId = Math.floor(Math.random() * 20_000_000);

    const [titleRow] = await db
      .insert(schema.title)
      .values({
        kind: "show",
        tmdbId,
        name: titleName,
        releaseYear: 2024,
        posterPath,
        inProduction: true,
      })
      .returning({ id: schema.title.id });

    const aired = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const episodeRows = await db
      .insert(schema.episode)
      .values(
        Array.from({ length: episodes }, (_, index) => ({
          titleId: titleRow.id,
          tmdbEpisodeId: tmdbId * 100 + index + 1,
          seasonNo: 1,
          episodeNo: index + 1,
          name: `Fixture Episode ${index + 1}`,
          airDate: aired,
        })),
      )
      .returning({ id: schema.episode.id, episodeNo: schema.episode.episodeNo });

    const [entryRow] = await db
      .insert(schema.libraryEntry)
      .values({ userId, titleId: titleRow.id })
      .returning({ id: schema.libraryEntry.id });

    for (const row of episodeRows) {
      if (!watched.includes(row.episodeNo)) continue;
      await db.insert(schema.watch).values({
        userId,
        libraryEntryId: entryRow.id,
        titleId: titleRow.id,
        episodeId: row.id,
        watchedAt: new Date(),
        source: "e2e-fixture",
        sourceKey: randomUUID(),
      });
    }

    return { libraryEntryId: entryRow.id, titleName, posterPath };
  } finally {
    await pool.end();
  }
}
