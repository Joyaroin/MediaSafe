import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  asUserId,
  lastWatchedOwner,
  lastWatchedTitle,
  renewLastWatchedToken,
  switchOffLastWatchedSharing,
  switchOnLastWatchedSharing,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The last-watched link's reads and writes — issue #528, against a real database.
 *
 * Two properties fail silently: the link (one that still answers after the reader switched
 * it off or replaced it is a publication they believe they undid) and the title (the wrong
 * one is a plausible sentence on someone's website).
 */

setUpTestDatabase("mediasafe_last_watched_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

const at = (iso: string) => new Date(iso);

interface WatchSpec {
  /** `null` is an undated watch. */
  watchedAt: Date | null;
  createdAt?: Date;
  /** Watch `id`, to pin the last tie-break. */
  id?: string;
}

/** A film in `userId`'s library, watched as each spec says; returns the watch ids. */
async function seedFilmWatches(
  tx: Transaction,
  userId: UserId,
  name: string,
  watches: WatchSpec[],
): Promise<void> {
  const [row] = await tx
    .insert(title)
    .values({ kind: "film", tmdbId: nextNumber(), name, releaseYear: 2020 })
    .returning({ id: title.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });

  for (const spec of watches) {
    await tx.insert(watch).values({
      ...(spec.id ? { id: spec.id } : {}),
      userId,
      libraryEntryId: entry.id,
      titleId: row.id,
      watchedAt: spec.watchedAt,
      ...(spec.createdAt ? { createdAt: spec.createdAt } : {}),
      source: "app",
      sourceKey: `test-${nextNumber()}`,
    });
  }
}

/** A show with one episode, watched at `watchedAt`. */
async function seedEpisodeWatch(
  tx: Transaction,
  userId: UserId,
  showName: string,
  watchedAt: Date,
): Promise<void> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({ kind: "show", tmdbId: number, name: showName, releaseYear: 2020 })
    .returning({ id: title.id });
  const [ep] = await tx
    .insert(episode)
    .values({
      titleId: row.id,
      tmdbEpisodeId: number * 10,
      seasonNo: 1,
      episodeNo: 1,
      name: "An episode name that must never be the answer",
    })
    .returning({ id: episode.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });

  await tx.insert(watch).values({
    userId,
    libraryEntryId: entry.id,
    titleId: row.id,
    episodeId: ep.id,
    watchedAt,
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });
}

describe("the last-watched link", () => {
  it("is off by default, so a token that was never minted answers nobody", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-default");

      const [row] = await tx.select().from(user).where(eqId(reader));
      expect(row.sharesLastWatched).toBe(false);
      expect(row.lastWatchedToken).toBeNull();
      expect(await lastWatchedOwner("b".repeat(43), tx)).toBeNull();
    });
  });

  it("answers to its owner once switched on, with a token of the minted shape", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-on");
      const other = await seedUser(tx, "lw-on-other");

      const token = await switchOnLastWatchedSharing(reader, tx);
      const otherToken = await switchOnLastWatchedSharing(other, tx);

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(otherToken).not.toBe(token);
      expect(await lastWatchedOwner(token, tx)).toBe(reader);
      expect(await lastWatchedOwner(otherToken, tx)).toBe(other);
    });
  });

  it("stops answering once switched off", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-off");
      const token = await switchOnLastWatchedSharing(reader, tx);

      await switchOffLastWatchedSharing(reader, tx);

      expect(await lastWatchedOwner(token, tx)).toBeNull();
    });
  });

  it("brings the same link back when switched on again", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-again");
      const first = await switchOnLastWatchedSharing(reader, tx);
      await switchOffLastWatchedSharing(reader, tx);

      const second = await switchOnLastWatchedSharing(reader, tx);

      expect(second).toBe(first);
      expect(await lastWatchedOwner(first, tx)).toBe(reader);
    });
  });

  it("keeps the same link when switched on while already on", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-twice");
      const first = await switchOnLastWatchedSharing(reader, tx);

      expect(await switchOnLastWatchedSharing(reader, tx)).toBe(first);
    });
  });

  it("answers 404 to the old link and the new one answers, once replaced", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-renew");
      const first = await switchOnLastWatchedSharing(reader, tx);

      const second = await renewLastWatchedToken(reader, tx);

      expect(second).not.toBe(first);
      expect(await lastWatchedOwner(first, tx)).toBeNull();
      expect(await lastWatchedOwner(second, tx)).toBe(reader);
    });
  });

  it("keeps a replaced link dead after switching off and on again", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-renew-cycle");
      const first = await switchOnLastWatchedSharing(reader, tx);
      const second = await renewLastWatchedToken(reader, tx);

      await switchOffLastWatchedSharing(reader, tx);
      const third = await switchOnLastWatchedSharing(reader, tx);

      expect(third).toBe(second);
      expect(await lastWatchedOwner(first, tx)).toBeNull();
    });
  });

  it("leaves sharing off when the link is replaced while off, so neither link answers", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-renew-off");
      const first = await switchOnLastWatchedSharing(reader, tx);
      await switchOffLastWatchedSharing(reader, tx);

      const second = await renewLastWatchedToken(reader, tx);

      const [row] = await tx.select().from(user).where(eqId(reader));
      expect(second).not.toBe(first);
      expect(row.lastWatchedToken).toBe(second);
      expect(row.sharesLastWatched).toBe(false);
      expect(await lastWatchedOwner(first, tx)).toBeNull();
      expect(await lastWatchedOwner(second, tx)).toBeNull();
    });
  });

  it("is not the calendar feed's token", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lw-not-calendar");
      const token = await switchOnLastWatchedSharing(reader, tx);

      const [row] = await tx.select().from(user).where(eqId(reader));
      expect(row.calendarFeedToken).toBeNull();
      expect(row.lastWatchedToken).toBe(token);
    });
  });
});

describe("lastWatchedTitle", () => {
  it("is null for a reader with no watches", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lt-none");

      expect(await lastWatchedTitle(reader, tx)).toBeNull();
    });
  });

  it("is null for a reader whose watches are all undated", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lt-undated");
      await seedFilmWatches(tx, reader, "Imported", [{ watchedAt: null }]);

      expect(await lastWatchedTitle(reader, tx)).toBeNull();
    });
  });

  it("answers the title with the greatest watched time", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lt-greatest");
      await seedFilmWatches(tx, reader, "Older", [{ watchedAt: at("2024-01-01T10:00:00Z") }]);
      await seedFilmWatches(tx, reader, "Newest", [{ watchedAt: at("2024-03-01T10:00:00Z") }]);
      await seedFilmWatches(tx, reader, "Middle", [{ watchedAt: at("2024-02-01T10:00:00Z") }]);

      expect(await lastWatchedTitle(reader, tx)).toBe("Newest");
    });
  });

  it("goes by the watch time, not by when the watch was logged", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lt-watched-not-logged");
      await seedFilmWatches(tx, reader, "Watched last, logged first", [
        { watchedAt: at("2024-03-01T10:00:00Z"), createdAt: at("2024-03-01T10:00:00Z") },
      ]);
      await seedFilmWatches(tx, reader, "Watched first, logged last", [
        { watchedAt: at("2024-01-01T10:00:00Z"), createdAt: at("2025-01-01T10:00:00Z") },
      ]);

      expect(await lastWatchedTitle(reader, tx)).toBe("Watched last, logged first");
    });
  });

  it("never counts an undated watch, however recently it was logged", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lt-undated-never");
      await seedFilmWatches(tx, reader, "Dated long ago", [
        { watchedAt: at("2010-01-01T10:00:00Z"), createdAt: at("2010-01-01T10:00:00Z") },
      ]);
      await seedFilmWatches(tx, reader, "Imported today", [
        { watchedAt: null, createdAt: at("2030-01-01T10:00:00Z") },
      ]);

      expect(await lastWatchedTitle(reader, tx)).toBe("Dated long ago");
    });
  });

  // Postgres may hand back equal-sorting rows in insertion order, so each tie-break case runs
  // with the winner inserted first and last: with the rule removed, one of the two orders
  // answers the loser.
  describe.each([
    { order: "winner inserted first", winnerFirst: true },
    { order: "winner inserted last", winnerFirst: false },
  ])("with the $order", ({ winnerFirst }) => {
    const seedPair = async (
      tx: Transaction,
      reader: UserId,
      winner: { name: string; spec: WatchSpec },
      loser: { name: string; spec: WatchSpec },
    ) => {
      for (const one of winnerFirst ? [winner, loser] : [loser, winner]) {
        await seedFilmWatches(tx, reader, one.name, [one.spec]);
      }
    };

    it("breaks equal watched times by the later created_at", async () => {
      await inTransaction(async (tx) => {
        const reader = await seedUser(tx, "lt-created");
        const same = at("2024-05-05T20:00:00Z");
        await seedPair(
          tx,
          reader,
          // The loser has the greater id, so dropping created_at hands it the win.
          {
            name: "Logged later",
            spec: {
              watchedAt: same,
              createdAt: at("2024-05-06T00:00:00Z"),
              id: "00000000-0000-4000-8000-000000000000",
            },
          },
          {
            name: "Logged earlier",
            spec: {
              watchedAt: same,
              createdAt: at("2024-05-05T21:00:00Z"),
              id: "ffffffff-0000-4000-8000-000000000000",
            },
          },
        );

        expect(await lastWatchedTitle(reader, tx)).toBe("Logged later");
      });
    });

    it("breaks equal watched and created times by the greater watch id", async () => {
      await inTransaction(async (tx) => {
        const reader = await seedUser(tx, "lt-id");
        const same = at("2024-05-05T20:00:00Z");
        const created = at("2024-05-06T00:00:00Z");
        await seedPair(
          tx,
          reader,
          {
            name: "Greater id",
            spec: { watchedAt: same, createdAt: created, id: "ffffffff-0000-4000-8000-000000000000" },
          },
          {
            name: "Lesser id",
            spec: { watchedAt: same, createdAt: created, id: "00000000-0000-4000-8000-000000000000" },
          },
        );

        expect(await lastWatchedTitle(reader, tx)).toBe("Greater id");
      });
    });
  });

  it("answers an episode's show, never the episode", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lt-episode");
      await seedFilmWatches(tx, reader, "A film", [{ watchedAt: at("2024-01-01T10:00:00Z") }]);
      await seedEpisodeWatch(tx, reader, "The Show", at("2024-02-01T10:00:00Z"));

      expect(await lastWatchedTitle(reader, tx)).toBe("The Show");
    });
  });

  it("answers from the reader's own watches only", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "lt-own");
      const other = await seedUser(tx, "lt-other");
      await seedFilmWatches(tx, reader, "Mine", [{ watchedAt: at("2024-01-01T10:00:00Z") }]);
      await seedFilmWatches(tx, other, "Theirs", [{ watchedAt: at("2025-01-01T10:00:00Z") }]);

      expect(await lastWatchedTitle(reader, tx)).toBe("Mine");
    });
  });
});

function eqId(id: UserId) {
  return eq(user.id, id);
}
