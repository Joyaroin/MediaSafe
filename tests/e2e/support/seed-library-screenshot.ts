import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";
import { seedFixtureSession } from "./fixture-session";
import { toStorageState } from "./storage-state";

/**
 * Seeds the library the README's Library screenshot is taken from (issue #593), and writes the
 * session that signs in to it. Run it by hand against the local Docker Postgres:
 *
 *   DATABASE_URL=<a scratch database> npx tsx --env-file-if-exists=.env \
 *     tests/e2e/support/seed-library-screenshot.ts <out.json>
 *
 * Seed an empty scratch database, not the one the specs share: it takes each title's real TMDB
 * id, so a title already stored under that id keeps its own episodes and the states come out
 * wrong. A database just created and migrated is the safe case.
 *
 * It is not a spec and nothing imports it. It lives here because it reuses this folder's
 * session fixture, and for the same reason `fixture-session.ts` gives: it writes rows no
 * application path would, for an account that is never real user data.
 *
 * ── Real titles, so the posters are real ────────────────────────────────────────────────
 *
 * Each name is looked up on TMDB for its id, year and poster, so the grid draws artwork the
 * way the app does. The episodes are made up (one season, all aired in the past): the Library
 * page shows a state and a progress bar, never an episode name. The state each show lands in
 * comes from the watches and `in_production` set here, not from TMDB: *Waiting for new
 * episodes* is every aired episode watched with the show still in production, *Finished* the
 * same with it ended. Needs `TMDB_READ_ACCESS_TOKEN` in the environment.
 */

interface Show {
  readonly name: string;
  readonly episodes: number;
  /** How many of the episodes, from the first, are watched. */
  readonly watched: number;
  readonly inProduction: boolean;
  readonly abandoned?: boolean;
}

// Within a section, Watching is ordered by latest watch (first listed = most recent) and Not
// started by when it was added (the last one added comes first), so Not started is listed
// oldest-first here.
const WATCHING: readonly Show[] = [
  { name: "Severance", episodes: 19, watched: 12, inProduction: true },
  { name: "The Bear", episodes: 28, watched: 9, inProduction: true },
  { name: "Slow Horses", episodes: 30, watched: 21, inProduction: true },
  { name: "Andor", episodes: 24, watched: 7, inProduction: false },
  { name: "Shōgun", episodes: 10, watched: 4, inProduction: true },
  { name: "Fargo", episodes: 51, watched: 18, inProduction: true },
  { name: "Reacher", episodes: 24, watched: 11, inProduction: true },
  { name: "Silo", episodes: 20, watched: 8, inProduction: true },
  { name: "Pachinko", episodes: 16, watched: 5, inProduction: true },
  { name: "Poker Face", episodes: 20, watched: 14, inProduction: true },
];

const NOT_STARTED: readonly Show[] = [
  { name: "The Wire", episodes: 60, watched: 0, inProduction: false },
  { name: "Chernobyl", episodes: 5, watched: 0, inProduction: false },
  { name: "Dark", episodes: 26, watched: 0, inProduction: false },
  { name: "Mr. Robot", episodes: 45, watched: 0, inProduction: false },
  { name: "Better Call Saul", episodes: 63, watched: 0, inProduction: false },
  { name: "Fleabag", episodes: 12, watched: 0, inProduction: false },
  { name: "Black Mirror", episodes: 33, watched: 0, inProduction: false },
  { name: "True Detective", episodes: 32, watched: 0, inProduction: false },
  { name: "Mindhunter", episodes: 19, watched: 0, inProduction: false },
  { name: "The Leftovers", episodes: 28, watched: 0, inProduction: false },
];

const WAITING: readonly Show[] = [
  { name: "Ted Lasso", episodes: 34, watched: 34, inProduction: true },
  { name: "Only Murders in the Building", episodes: 40, watched: 40, inProduction: true },
  { name: "Abbott Elementary", episodes: 54, watched: 54, inProduction: true },
  { name: "Hacks", episodes: 30, watched: 30, inProduction: true },
  { name: "Shrinking", episodes: 22, watched: 22, inProduction: true },
  { name: "The Last of Us", episodes: 16, watched: 16, inProduction: true },
  { name: "Foundation", episodes: 30, watched: 30, inProduction: true },
  { name: "Mythic Quest", episodes: 39, watched: 39, inProduction: true },
  { name: "Platonic", episodes: 20, watched: 20, inProduction: true },
];

const FINISHED: readonly Show[] = [
  { name: "Breaking Bad", episodes: 62, watched: 62, inProduction: false },
  { name: "Succession", episodes: 39, watched: 39, inProduction: false },
  { name: "Station Eleven", episodes: 10, watched: 10, inProduction: false },
  { name: "The Queen's Gambit", episodes: 7, watched: 7, inProduction: false },
  { name: "Barry", episodes: 32, watched: 32, inProduction: false },
];

const DROPPED: readonly Show[] = [
  { name: "The Walking Dead", episodes: 177, watched: 31, inProduction: false, abandoned: true },
  { name: "Lost in Space", episodes: 28, watched: 6, inProduction: false, abandoned: true },
];

interface TmdbHit {
  readonly id: number;
  readonly name: string;
  readonly poster_path: string | null;
  readonly first_air_date?: string;
}

async function lookUp(name: string, token: string): Promise<TmdbHit> {
  const response = await fetch(
    `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`TMDB search for "${name}" answered ${response.status}`);

  const body = (await response.json()) as { results: TmdbHit[] };
  const withPoster = body.results.filter((result) => result.poster_path);
  const hit =
    withPoster.find((result) => result.name.toLowerCase() === name.toLowerCase()) ?? withPoster[0];
  if (!hit) throw new Error(`TMDB has no poster for "${name}"`);
  return hit;
}

async function main(): Promise<void> {
  const out = process.argv[2];
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!out) throw new Error("Usage: seed-library-screenshot.ts <storage-state-out.json>");
  if (!token) throw new Error("TMDB_READ_ACCESS_TOKEN is not set.");

  const session = await seedFixtureSession();
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    // The sidebar prints the account's name; a fixture's own would read "Playwright Fixture".
    await db.update(schema.user).set({ name: "Sam" }).where(eq(schema.user.id, session.userId));

    const day = 24 * 60 * 60 * 1000;
    const aired = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * day).toISOString().slice(0, 10);

    // Oldest watch first so a later show ranks higher in Watching.
    const ordered: readonly Show[] = [
      ...[...WATCHING].reverse(),
      ...NOT_STARTED,
      ...WAITING,
      ...FINISHED,
      ...DROPPED,
    ];

    let recent = 0;
    for (const show of ordered) {
      const hit = await lookUp(show.name, token);
      const [titleRow] = await db
        .insert(schema.title)
        .values({
          kind: "show",
          tmdbId: hit.id,
          name: hit.name,
          releaseYear: hit.first_air_date ? Number(hit.first_air_date.slice(0, 4)) : null,
          posterPath: hit.poster_path,
          inProduction: show.inProduction,
        })
        .onConflictDoUpdate({
          target: [schema.title.kind, schema.title.tmdbId],
          set: { posterPath: hit.poster_path, inProduction: show.inProduction },
        })
        .returning({ id: schema.title.id });

      const existing = await db
        .select({ id: schema.episode.id })
        .from(schema.episode)
        .where(eq(schema.episode.titleId, titleRow.id));
      if (existing.length === 0) {
        await db.insert(schema.episode).values(
          Array.from({ length: show.episodes }, (_, index) => ({
            titleId: titleRow.id,
            tmdbEpisodeId: hit.id * 1000 + index + 1,
            seasonNo: 1,
            episodeNo: index + 1,
            name: `Episode ${index + 1}`,
            airDate: aired(400 - index),
          })),
        );
      }

      const [entryRow] = await db
        .insert(schema.libraryEntry)
        .values({
          userId: session.userId,
          titleId: titleRow.id,
          abandonedAt: show.abandoned ? new Date() : null,
        })
        .returning({ id: schema.libraryEntry.id });

      if (show.watched > 0) {
        recent += 1;
        const episodes = await db
          .select({ id: schema.episode.id, episodeNo: schema.episode.episodeNo })
          .from(schema.episode)
          .where(eq(schema.episode.titleId, titleRow.id));

        for (const episode of episodes) {
          if (episode.episodeNo > show.watched) continue;
          await db.insert(schema.watch).values({
            userId: session.userId,
            libraryEntryId: entryRow.id,
            titleId: titleRow.id,
            episodeId: episode.id,
            // Each show's watches end a little later than the one before it.
            watchedAt: new Date(Date.now() - 60 * day + recent * day + episode.episodeNo * 1000),
            source: "e2e-fixture",
            sourceKey: randomUUID(),
          });
        }
      }
    }
  } finally {
    await pool.end();
  }

  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(path.resolve(out), JSON.stringify(toStorageState(session), null, 2));
  console.log(`Seeded ${session.email}; session written to ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
