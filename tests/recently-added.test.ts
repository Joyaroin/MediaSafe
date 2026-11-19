import { describe, expect, it } from "vitest";

import { asUserId, listRecentlyAdded, RECENTLY_ADDED_SIZE, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, title, user } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Search's *Recently added* (issue #542): the last six titles by `added_at`, newest first,
 * then `lower(name)`, then the entry id. Rows go in through the harness's transaction and
 * the read is called directly.
 */

setUpTestDatabase("mediasafe_recently_added_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction): Promise<UserId> {
  const id = `reader-${nextNumber()}`;
  await tx.insert(user).values({ id, name: id, email: `${id}@example.test` });
  return asUserId(id);
}

async function add(
  tx: Transaction,
  userId: UserId,
  name: string,
  addedAt: Date,
  kind: "show" | "film" = "show",
): Promise<string> {
  const [row] = await tx
    .insert(title)
    .values({ kind, tmdbId: nextNumber(), name, releaseYear: 2022 })
    .returning({ id: title.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, addedAt })
    .returning({ id: libraryEntry.id });
  return entry.id;
}

const at = (month: number) => new Date(Date.UTC(2026, month - 1, 1));

describe("listRecentlyAdded", () => {
  it("is empty, as a successful read, for a library with nothing in it", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      expect(await listRecentlyAdded(reader, tx)).toEqual([]);
    });
  });

  it("is six titles, newest added first", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      for (let month = 1; month <= 8; month += 1) {
        await add(tx, reader, `Title ${month}`, at(month), month % 2 === 0 ? "film" : "show");
      }

      const rows = await listRecentlyAdded(reader, tx);
      expect(RECENTLY_ADDED_SIZE).toBe(6);
      expect(rows.map((row) => row.name)).toEqual([
        "Title 8",
        "Title 7",
        "Title 6",
        "Title 5",
        "Title 4",
        "Title 3",
      ]);
      // Both kinds are in the one row of six.
      expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(["film", "show"]));
    });
  });

  it("breaks a tied added_at by lower(name), then the entry id", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const tied = at(3);
      await add(tx, reader, "zulu", tied);
      await add(tx, reader, "Bravo", tied);
      const first = await add(tx, reader, "Twin", tied);
      const second = await add(tx, reader, "Twin", tied);
      await add(tx, reader, "alpha", tied);
      await add(tx, reader, "Older", at(1));

      const rows = await listRecentlyAdded(reader, tx);
      expect(rows.map((row) => row.name)).toEqual([
        "alpha",
        "Bravo",
        "Twin",
        "Twin",
        "zulu",
        "Older",
      ]);
      expect([rows[2].libraryEntryId, rows[3].libraryEntryId]).toEqual(
        [first, second].sort(),
      );
    });
  });

  it("carries what the card prints and the id the title page opens", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const entryId = await add(tx, reader, "Hacks", at(2));

      expect(await listRecentlyAdded(reader, tx)).toEqual([
        {
          libraryEntryId: entryId,
          name: "Hacks",
          releaseYear: 2022,
          posterPath: null,
          posterColour: null,
          kind: "show",
        },
      ]);
    });
  });

  it("reads only this account's entries", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const other = await seedUser(tx);
      await add(tx, other, "Not yours", at(5));
      await add(tx, reader, "Yours", at(1));

      expect((await listRecentlyAdded(reader, tx)).map((row) => row.name)).toEqual(["Yours"]);
    });
  });
});
