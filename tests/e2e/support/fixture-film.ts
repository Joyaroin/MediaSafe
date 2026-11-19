import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";
import type { SeededTitle } from "./fixture-library";

/**
 * A film in the library, for the Library sections spec (issue #552). Its Library section is
 * set by what is passed: `released` and nothing else is *To watch* (a day ago) or *Coming
 * soon* (a day ahead); `watched` is *Watched*; `abandoned` is *Dropped*, whether or not it
 * also has a watch (`db/views.ts`: abandoned is the view's first rule).
 */
export async function seedFilm(
  userId: string,
  {
    released = true,
    watched = false,
    abandoned = false,
  }: { readonly released?: boolean; readonly watched?: boolean; readonly abandoned?: boolean } = {},
): Promise<SeededTitle> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    const unique = randomUUID();
    const titleName = `E2E Fixture Film ${unique}`;
    const posterPath = `/e2e-fixture-${unique}.jpg`;
    const day = 24 * 60 * 60 * 1000;
    const releaseDate = new Date(Date.now() + (released ? -day : day)).toISOString().slice(0, 10);

    const [titleRow] = await db
      .insert(schema.title)
      .values({
        kind: "film",
        tmdbId: Math.floor(Math.random() * 200_000_000),
        name: titleName,
        releaseYear: new Date(releaseDate).getUTCFullYear(),
        releaseDate,
        posterPath,
      })
      .returning({ id: schema.title.id });

    const [entryRow] = await db
      .insert(schema.libraryEntry)
      .values({ userId, titleId: titleRow.id, abandonedAt: abandoned ? new Date() : null })
      .returning({ id: schema.libraryEntry.id });

    if (watched) {
      await db.insert(schema.watch).values({
        userId,
        libraryEntryId: entryRow.id,
        titleId: titleRow.id,
        episodeId: null,
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
