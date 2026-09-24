import { eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { accountFootprint, asUserId, deleteAccount, ownedBy, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  account,
  episode,
  libraryEntry,
  list,
  listMembership,
  session,
  title,
  user,
  watch,
} from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Account deletion, against real Postgres — issue #125.
 *
 * ── Why this file is the whole safety net ────────────────────────────────────────────
 *
 * Deleting an account is the one irreversible thing in the product, and the mechanism it
 * leans on is `ON DELETE CASCADE`, which is a property of the database rather than of any
 * line of TypeScript. A mock of a cascade tests the mock. So every assertion below runs
 * against a migrated Postgres through issue #40's harness, and the two that matter most
 * are the ones nothing else in the suite would notice going wrong:
 *
 *  - **`title` and `episode` survive.** The catalogue is global and unowned, so
 *    a cascade that reached it would let one person's departure empty every other
 *    account's library. Nothing on any screen would say so.
 *  - **The counts shown are the rows removed.** The delete-account page states what will be
 *    destroyed in real numbers, and a number that does not match what the delete takes is
 *    a lie told on the one screen where acting on it cannot be undone.
 *
 * ── No network ───────────────────────────────────────────────────────────────────────
 *
 * `accountFootprint` and `deleteAccount` take a user id the caller already resolved and
 * the harness's transaction. Nothing here reaches TMDB, Google or Better Auth's HTTP
 * handler — which is also the assertion wanted about deletion itself: it is
 * one statement against Postgres, and there is no outbound call in it to make.
 */

setUpTestDatabase("mediasafe_delete_account_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

/**
 * A session and a Google `account` row for this user — the two Better Auth tables that
 * carry a signed-in reader, and the two the ticket names as *owned rows* even though
 * neither is one of MediaSafe's own.
 *
 * `updatedAt` is passed by hand: Better Auth's generated schema declares it `notNull` with
 * an `$onUpdate` and no database default, so an insert that omits it fails.
 */
async function seedSignedIn(tx: Transaction, userId: UserId): Promise<void> {
  const number = nextNumber();
  await tx.insert(session).values({
    id: `session-${number}`,
    userId,
    token: `token-${number}`,
    expiresAt: new Date(Date.now() + 86_400_000),
    updatedAt: new Date(),
  });
  await tx.insert(account).values({
    id: `account-${number}`,
    userId,
    accountId: `google-${number}`,
    providerId: "google",
    updatedAt: new Date(),
  });
}

/** A show with one episode, in the global catalogue and owned by nobody. */
async function seedShow(tx: Transaction): Promise<{ titleId: string; episodeId: string }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: `Show ${number}`,
      releaseYear: 2022,
      inProduction: true,
    })
    .returning({ id: title.id });

  const [one] = await tx
    .insert(episode)
    .values({
      titleId: row.id,
      tmdbEpisodeId: nextNumber(),
      seasonNo: 1,
      episodeNo: 1,
      name: `S1E1 of ${number}`,
      airDate: "2022-01-01",
    })
    .returning({ id: episode.id });

  return { titleId: row.id, episodeId: one.id };
}

interface EntrySpec {
  readonly rating?: number;
  readonly watches?: number;
}

/** One account's relationship with one title: the entry, its rating, and its watches. */
async function seedEntry(
  tx: Transaction,
  userId: UserId,
  show: { titleId: string; episodeId: string },
  spec: EntrySpec = {},
): Promise<string> {
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: show.titleId, rating: spec.rating ?? null })
    .returning({ id: libraryEntry.id });

  for (let index = 0; index < (spec.watches ?? 0); index += 1) {
    await tx.insert(watch).values({
      userId,
      libraryEntryId: entry.id,
      titleId: show.titleId,
      episodeId: show.episodeId,
      watchedAt: new Date(),
      source: "app",
      sourceKey: `click-${nextNumber()}`,
    });
  }

  return entry.id;
}

async function seedList(
  tx: Transaction,
  userId: UserId,
  titleId: string,
): Promise<string> {
  const number = nextNumber();
  const [row] = await tx
    .insert(list)
    .values({ userId, name: `List ${number}` })
    .returning({ id: list.id });
  await tx
    .insert(listMembership)
    .values({ listId: row.id, titleId, userId, position: 1 });
  return row.id;
}

/**
 * How many rows of each owned table this account still has — every table the ticket
 * names, counted one by one rather than through a helper that takes a table, because the
 * point of the assertion is that no table is missing from the list.
 */
async function ownedRowCounts(tx: Transaction, userId: UserId) {
  return {
    entries: (await tx.select().from(libraryEntry).where(ownedBy(userId, libraryEntry)))
      .length,
    watches: (await tx.select().from(watch).where(ownedBy(userId, watch))).length,
    lists: (await tx.select().from(list).where(ownedBy(userId, list))).length,
    memberships: (
      await tx.select().from(listMembership).where(ownedBy(userId, listMembership))
    ).length,
    sessions: (await tx.select().from(session).where(eq(session.userId, userId))).length,
    accounts: (await tx.select().from(account).where(eq(account.userId, userId))).length,
    users: (await tx.select().from(user).where(eq(user.id, userId))).length,
  };
}

describe("the numbers the page states", () => {
  it("counts this account's titles, watches and ratings", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const rated = await seedShow(tx);
      const unrated = await seedShow(tx);
      const untouched = await seedShow(tx);

      await seedEntry(tx, reader, rated, { rating: 8, watches: 3 });
      await seedEntry(tx, reader, unrated, { watches: 2 });
      await seedEntry(tx, reader, untouched);

      expect(await accountFootprint(reader, tx)).toEqual({
        titles: 3,
        watches: 5,
        ratings: 1,
      });
    });
  });

  it("is zeroes for an account that has added nothing — a read that succeeded", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "newcomer");

      expect(await accountFootprint(reader, tx)).toEqual({
        titles: 0,
        watches: 0,
        ratings: 0,
      });
    });
  });

  it("never counts another account's rows, including on a title they share", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const shared = await seedShow(tx);
      const theirs = await seedShow(tx);

      await seedEntry(tx, reader, shared, { rating: 9, watches: 1 });
      await seedEntry(tx, other, shared, { rating: 4, watches: 6 });
      await seedEntry(tx, other, theirs, { rating: 5, watches: 4 });

      expect(await accountFootprint(reader, tx)).toEqual({
        titles: 1,
        watches: 1,
        ratings: 1,
      });
      expect(await accountFootprint(other, tx)).toEqual({
        titles: 2,
        watches: 10,
        ratings: 2,
      });
    });
  });
});

describe("deleting the account", () => {
  it("removes every owned row, the user included", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedSignedIn(tx, reader);
      const show = await seedShow(tx);
      await seedEntry(tx, reader, show, { rating: 7, watches: 2 });
      await seedList(tx, reader, show.titleId);

      expect(await ownedRowCounts(tx, reader)).toEqual({
        entries: 1,
        watches: 2,
        lists: 1,
        memberships: 1,
        sessions: 1,
        accounts: 1,
        users: 1,
      });

      await deleteAccount(reader, tx);

      expect(await ownedRowCounts(tx, reader)).toEqual({
        entries: 0,
        watches: 0,
        lists: 0,
        memberships: 0,
        sessions: 0,
        accounts: 0,
        users: 0,
      });
    });
  });

  it("leaves the catalogue standing, including a title only this account held", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const only = await seedShow(tx);
      await seedEntry(tx, reader, only, { watches: 1 });

      await deleteAccount(reader, tx);

      const titles = await tx.select().from(title).where(eq(title.id, only.titleId));
      const episodes = await tx
        .select()
        .from(episode)
        .where(eq(episode.id, only.episodeId));

      expect(titles).toHaveLength(1);
      expect(episodes).toHaveLength(1);
    });
  });

  it("leaves every other account untouched, including their entry for a shared title", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      await seedSignedIn(tx, other);
      const shared = await seedShow(tx);

      await seedEntry(tx, reader, shared, { rating: 3, watches: 2 });
      await seedEntry(tx, other, shared, { rating: 10, watches: 4 });
      await seedList(tx, other, shared.titleId);

      await deleteAccount(reader, tx);

      expect(await ownedRowCounts(tx, other)).toEqual({
        entries: 1,
        watches: 4,
        lists: 1,
        memberships: 1,
        sessions: 1,
        accounts: 1,
        users: 1,
      });
      expect(await accountFootprint(other, tx)).toEqual({
        titles: 1,
        watches: 4,
        ratings: 1,
      });
    });
  });

  /**
   * *No outbound call to Google is made* — the acceptance criterion that was, until this
   * test, asserted only in prose.
   *
   * It guards a decision rather than a mechanism, which is why it is worth a test at all:
   * issue #125 **rejected** revoking the OAuth grant programmatically, on the grounds that
   * an outbound call which can fail in the middle of an irreversible operation leaves a
   * half-deleted account, and that a half-failed deletion is worse than the honest sentence
   * the page prints instead. Nothing in the type system stops a later edit from adding that
   * call back; this does.
   *
   * The assertion is scoped to Google's hosts rather than to *any* `fetch`, deliberately. A
   * blanket *no fetch at all* would be a test about the Neon driver's transport — it speaks
   * over a WebSocket here and could reasonably use `fetch` in another mode — and it would
   * fail for a reason that has nothing to do with what this is protecting.
   */
  it("makes no outbound call to Google", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      await seedEntry(tx, reader, show, { rating: 5, watches: 2 });

      const reached: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (...args: Parameters<typeof fetch>) => {
        const [input] = args;
        reached.push(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        return realFetch(...args);
      };

      try {
        await deleteAccount(reader, tx);
      } finally {
        globalThis.fetch = realFetch;
      }

      expect(reached.filter((url) => /google|googleapis|oauth2/i.test(url))).toEqual([]);
    });
  });

  it("destroys exactly the numbers the page stated", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const shared = await seedShow(tx);
      const second = await seedShow(tx);

      await seedEntry(tx, reader, shared, { rating: 6, watches: 3 });
      await seedEntry(tx, reader, second, { watches: 4 });
      await seedEntry(tx, other, shared, { rating: 2, watches: 5 });

      const stated = await accountFootprint(reader, tx);

      const titlesBefore = await countEntries(tx);
      const watchesBefore = await countWatches(tx);
      const ratingsBefore = await countRatings(tx);

      await deleteAccount(reader, tx);

      expect({
        titles: titlesBefore - (await countEntries(tx)),
        watches: watchesBefore - (await countWatches(tx)),
        ratings: ratingsBefore - (await countRatings(tx)),
      }).toEqual(stated);
    });
  });
});

/**
 * Whole-table counts, unscoped and deliberately so: the assertion above is that the
 * numbers the page stated are the rows the delete removed **from the database**, which a
 * count scoped to the deleted account could not make — after the delete, that scope is
 * empty whatever else the statement took with it.
 */
async function countEntries(tx: Transaction): Promise<number> {
  return (await tx.select().from(libraryEntry)).length;
}

async function countWatches(tx: Transaction): Promise<number> {
  return (await tx.select().from(watch)).length;
}

async function countRatings(tx: Transaction): Promise<number> {
  return (await tx.select().from(libraryEntry).where(isNotNull(libraryEntry.rating)))
    .length;
}
