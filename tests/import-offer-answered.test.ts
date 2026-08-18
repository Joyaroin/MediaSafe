import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { asUserId, markImportOfferAnswered, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { user } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `markImportOfferAnswered`, against real Postgres — issue #75, completing the column
 * issue #70 declared and deliberately left unwritten.
 *
 * The row it writes is Better Auth's own `user` table, not one of MediaSafe's owned six,
 * so there is no `ownedBy` predicate here to prove — only that the one write this ticket
 * adds actually lands, and lands idempotently, on the exact column `auth-schema.ts`
 * generated from `lib/auth.ts`'s `additionalFields` entry.
 */

setUpTestDatabase("mediasafe_import_offer_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction): Promise<UserId> {
  const id = `answerer-${nextNumber()}`;
  await tx.insert(user).values({ id, name: "Someone", email: `${id}@example.test` });
  return asUserId(id);
}

async function answeredAt(tx: Transaction, userId: UserId): Promise<Date | null> {
  const [row] = await tx
    .select({ importOfferAnsweredAt: user.importOfferAnsweredAt })
    .from(user)
    .where(eq(user.id, userId));
  return row.importOfferAnsweredAt;
}

describe("markImportOfferAnswered", () => {
  it("is null on a freshly created row — the unanswered state migration leaves every existing row in", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      expect(await answeredAt(tx, userId)).toBeNull();
    }));

  it("stamps the column once called", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      await markImportOfferAnswered(userId, tx);

      expect(await answeredAt(tx, userId)).toBeInstanceOf(Date);
    }));

  it("only ever moves the timestamp forward, and never throws on a second call", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx);

      await markImportOfferAnswered(userId, tx);
      const first = await answeredAt(tx, userId);

      await markImportOfferAnswered(userId, tx);
      const second = await answeredAt(tx, userId);

      expect(second).not.toBeNull();
      expect(second!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
    }));

  it("touches only the row it was asked for", () =>
    inTransaction(async (tx) => {
      const answered = await seedUser(tx);
      const untouched = await seedUser(tx);

      await markImportOfferAnswered(answered, tx);

      expect(await answeredAt(tx, answered)).toBeInstanceOf(Date);
      expect(await answeredAt(tx, untouched)).toBeNull();
    }));
});
