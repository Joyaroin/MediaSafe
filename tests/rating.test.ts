import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { asUserId, getTitleDetail, rateTitle, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `rateTitle`, against real Postgres — issue #113, and `SPEC.md` §7's *a whole number
 * 1–10, held on the library entry, overwritten on change, one per title and never one per
 * watch*.
 *
 * Every one of those clauses is a way the write could be wrong without throwing, which is
 * why they are checked here rather than trusted to the control:
 *
 *  1. **Overwritten, not accumulated.** A second rating leaves one number, not two rows
 *     and not a history.
 *  2. **Never per watch.** A rewatch after a rating changes nothing about the rating.
 *  3. **The range is real.** `library_entry_rating_check` allows 1–10 and this function
 *     refuses everything else *before* Postgres has to — including a fraction, which the
 *     column would silently round.
 *  4. **Another account's entry is not yours to rate.** The same `ownedBy` property every
 *     other write in `db/access.ts` carries.
 *
 * The harness is `tests/abandon.test.ts`'s, seeded straight against the tables so the
 * write under test is the only thing exercised.
 */

setUpTestDatabase("mediasafe_rating_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

async function seedFilm(
  tx: Transaction,
  userId: UserId,
): Promise<{ entryId: string; titleId: string }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "film",
      tmdbId: number,
      name: `Film ${number}`,
      releaseYear: 2019,
      runtimeMins: 132,
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id })
    .returning({ id: libraryEntry.id });

  return { entryId: entry.id, titleId: row.id };
}

async function storedRating(tx: Transaction, entryId: string): Promise<number | null> {
  const [row] = await tx
    .select({ rating: libraryEntry.rating })
    .from(libraryEntry)
    .where(eq(libraryEntry.id, entryId));
  return row.rating;
}

describe("rateTitle", () => {
  it("stores a rating on a title that had none", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedFilm(tx, userId);

      expect(await storedRating(tx, entryId)).toBeNull();

      await rateTitle(userId, entryId, 7, tx);

      expect(await storedRating(tx, entryId)).toBe(7);
    }));

  it("overwrites rather than adding — a second choice leaves one number", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedFilm(tx, userId);

      await rateTitle(userId, entryId, 3, tx);
      await rateTitle(userId, entryId, 9, tx);

      expect(await storedRating(tx, entryId)).toBe(9);

      // One rating per title is a property of the row, not of a query that happens to
      // pick the newest: there is nowhere for a second one to be.
      const rows = await tx
        .select({ id: libraryEntry.id })
        .from(libraryEntry)
        .where(eq(libraryEntry.id, entryId));
      expect(rows).toHaveLength(1);
    }));

  it("accepts both ends of the scale", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedFilm(tx, userId);

      await rateTitle(userId, entryId, 1, tx);
      expect(await storedRating(tx, entryId)).toBe(1);

      await rateTitle(userId, entryId, 10, tx);
      expect(await storedRating(tx, entryId)).toBe(10);
    }));

  it("refuses a value off the scale, and writes nothing when it does", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedFilm(tx, userId);
      await rateTitle(userId, entryId, 5, tx);

      for (const off of [0, 11, -1, 2.5, Number.NaN]) {
        await expect(rateTitle(userId, entryId, off, tx)).rejects.toThrow(
          /whole number 1-10/,
        );
      }

      expect(await storedRating(tx, entryId)).toBe(5);
    }));

  it("does not rate another account's entry", () =>
    inTransaction(async (tx) => {
      const owner = await seedUser(tx, "owner");
      const stranger = await seedUser(tx, "stranger");
      const { entryId } = await seedFilm(tx, owner);

      await expect(rateTitle(stranger, entryId, 8, tx)).rejects.toThrow(/not found/);

      expect(await storedRating(tx, entryId)).toBeNull();
    }));

  it("is never per watch — watching it again leaves the rating alone", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId, titleId } = await seedFilm(tx, userId);
      await rateTitle(userId, entryId, 6, tx);

      // A film's watch carries no episode; two of them is the rewatch (`CONTEXT.md`).
      for (const key of ["first", "second"]) {
        await tx.insert(watch).values({
          userId,
          libraryEntryId: entryId,
          titleId,
          episodeId: null,
          watchedAt: new Date(),
          source: "app",
          sourceKey: `${key}-${nextNumber()}`,
        });
      }

      expect(await storedRating(tx, entryId)).toBe(6);
    }));
});

describe("getTitleDetail's rating", () => {
  it("is null until one is given, and the stored number afterwards", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "reader");
      const { entryId } = await seedFilm(tx, userId);

      expect((await getTitleDetail(userId, entryId, tx)).rating).toBeNull();

      await rateTitle(userId, entryId, 4, tx);

      expect((await getTitleDetail(userId, entryId, tx)).rating).toBe(4);
    }));
});
