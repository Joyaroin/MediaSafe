import { describe, expect, it } from "vitest";

import { asUserId, mostRecentlyWatchedTitle, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The seed a recommendation rail is *because of* — `mostRecentlyWatchedTitle`. Per kind for
 * the search screen's modes, and across both kinds for Up next's empty state (issue #365).
 */
setUpTestDatabase("mediasafe_watched_seed_test");

let counter = 0;
const next = () => ++counter;

async function seedUser(tx: Transaction): Promise<UserId> {
  const id = `seed-reader-${next()}`;
  await tx.insert(user).values({ id, name: id, email: `${id}@example.test` });
  return asUserId(id);
}

async function watched(
  tx: Transaction,
  userId: UserId,
  kind: "film" | "show",
  name: string,
  watchedAt: Date,
): Promise<void> {
  const [row] = await tx
    .insert(title)
    .values({ kind, tmdbId: next(), name })
    .returning({ id: title.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });
  await tx.insert(watch).values({
    userId,
    libraryEntryId: entry.id,
    titleId: row.id,
    episodeId: null,
    watchedAt,
    source: "app",
    sourceKey: `seed-${next()}`,
  });
}

describe("the most recently watched title", () => {
  it("answers per kind, and across both kinds when asked for neither", () =>
    inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await watched(tx, reader, "show", "Severance", new Date("2026-10-01T20:00:00Z"));
      await watched(tx, reader, "film", "Arrival", new Date("2026-10-08T20:00:00Z"));

      expect((await mostRecentlyWatchedTitle(reader, "show", tx))?.name).toBe("Severance");
      expect((await mostRecentlyWatchedTitle(reader, "film", tx))?.name).toBe("Arrival");
      expect(await mostRecentlyWatchedTitle(reader, null, tx)).toMatchObject({
        kind: "film",
        name: "Arrival",
      });
    }));

  it("is null for a reader who has watched nothing — the trending fallback's case", () =>
    inTransaction(async (tx) => {
      const reader = await seedUser(tx);

      expect(await mostRecentlyWatchedTitle(reader, null, tx)).toBeNull();
    }));
});
