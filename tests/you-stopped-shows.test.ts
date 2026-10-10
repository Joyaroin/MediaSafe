import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { abandonTitle, asUserId, listStoppedShows, unabandonTitle, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, title, user } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `listStoppedShows` against a real Postgres — issue #373.
 */

setUpTestDatabase("mediasafe_you_stopped_shows_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test`, timezone: "UTC" });
  return asUserId(id);
}

async function seedEntry(
  tx: Transaction,
  userId: UserId,
  name: string,
  { kind = "show", abandonedAt = null }: { kind?: "show" | "film"; abandonedAt?: Date | null } = {},
): Promise<string> {
  const [titleRow] = await tx
    .insert(title)
    .values({ kind, tmdbId: nextNumber(), name, releaseYear: 2020 })
    .returning({ id: title.id });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: titleRow.id, abandonedAt })
    .returning({ id: libraryEntry.id });
  return entry.id;
}

describe("listStoppedShows", () => {
  it("lists stopped shows only, most recently stopped first", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      await seedEntry(tx, me, "Stopped long ago", { abandonedAt: new Date("2025-01-01T00:00:00Z") });
      await seedEntry(tx, me, "Stopped lately", { abandonedAt: new Date("2026-09-01T00:00:00Z") });
      await seedEntry(tx, me, "Still watching");
      await seedEntry(tx, me, "A stopped film", {
        kind: "film",
        abandonedAt: new Date("2026-09-02T00:00:00Z"),
      });

      expect((await listStoppedShows(me, tx)).map((entry) => entry.titleName)).toEqual([
        "Stopped lately",
        "Stopped long ago",
      ]);
    }));

  it("follows the existing abandon and unabandon writes", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const entryId = await seedEntry(tx, me, "Back and forth");

      await abandonTitle(me, entryId, tx);
      expect((await listStoppedShows(me, tx)).map((entry) => entry.libraryEntryId)).toEqual([entryId]);

      await unabandonTitle(me, entryId, tx);
      expect(await listStoppedShows(me, tx)).toEqual([]);
    }));

  it("returns this account's shows and never another account's", () =>
    inTransaction(async (tx) => {
      const me = await seedUser(tx, "me");
      const you = await seedUser(tx, "you");
      await seedEntry(tx, me, "Mine", { abandonedAt: new Date() });
      await seedEntry(tx, you, "Yours", { abandonedAt: new Date() });

      expect((await listStoppedShows(me, tx)).map((entry) => entry.titleName)).toEqual(["Mine"]);
    }));

  it("throws on a failed read rather than answering with no stopped shows", async () => {
    await expect(
      inTransaction(async (tx) => {
        const me = await seedUser(tx, "me");
        await tx.execute(sql`alter table library_entry rename to library_entry_unreachable`);
        return listStoppedShows(me, tx);
      }),
    ).rejects.toThrow();
  });
});
