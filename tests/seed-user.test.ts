import { describe, expect, it } from "vitest";

import { resolveSeedUserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { user } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `resolveSeedUserId` (issue #74) — the CLI's own boundary between a raw `--user`
 * string, or its absence, and a `UserId` nothing has looked up. `db/access.ts`'s header
 * holds the reasoning; this is the property: **it refuses rather than guesses**, in
 * every shape that ambiguity can take.
 */

setUpTestDatabase("mediasafe_seed_user_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<string> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return id;
}

describe("resolveSeedUserId", () => {
  it("resolves the sole user when none is named", () =>
    inTransaction(async (tx) => {
      const id = await seedUser(tx, "adham");

      expect(await resolveSeedUserId(undefined, tx)).toBe(id);
    }));

  it("refuses when the database has no users and none is named", () =>
    inTransaction(async (tx) => {
      await expect(resolveSeedUserId(undefined, tx)).rejects.toThrow(/no users/);
    }));

  it("refuses when the database holds more than one user and none is named", () =>
    inTransaction(async (tx) => {
      await seedUser(tx, "adham");
      await seedUser(tx, "someone-else");

      await expect(resolveSeedUserId(undefined, tx)).rejects.toThrow(/2 users/);
    }));

  it("resolves a named user even while others exist", () =>
    inTransaction(async (tx) => {
      const id = await seedUser(tx, "adham");
      await seedUser(tx, "someone-else");

      expect(await resolveSeedUserId(id, tx)).toBe(id);
    }));

  it("refuses a named id that names no row", () =>
    inTransaction(async (tx) => {
      await seedUser(tx, "adham");

      await expect(resolveSeedUserId("no-such-user", tx)).rejects.toThrow(
        /no-such-user/,
      );
    }));
});
