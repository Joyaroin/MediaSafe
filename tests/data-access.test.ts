import { sql, type SQL } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { asUserId, libraryEntryIdForEpisode, ownedBy, type UserId } from "@/db/access";
import { getDb, type Transaction } from "@/db/client";
import { episode, libraryEntry, title, user } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The harness, proved against a real Postgres, and the one thing the choke point can
 * guard before there are any owned rows to guard.
 *
 * Issue #40 is a prefactor: `db/access.ts` has no library entries and no watches to read
 * yet, so what is testable now is the *mechanism* — that a user id becomes a `user_id`
 * predicate, and that the harness these tests run in genuinely reaches Postgres and
 * genuinely leaves nothing behind. Step 4's watch-idempotency assertions are added to a file shaped exactly like this one, and add no infrastructure.
 *
 * A harness that silently no-ops is the failure worth designing against: it would pass
 * every assertion written against it forever. Most of the first block below exists only
 * to make that impossible.
 *
 * ── Why this is here, when only four tests earn their keep ───────────────────────────
 *
 * These are added knowingly, on the same grounds as `tests/migrator-transaction.test.ts`
 * argued for itself. The rule's reasoning is that everything else "fails loudly and
 * cheaply to an app used daily by its owner". A harness that has stopped isolating fails
 * neither loudly nor cheaply: it fails as test 3 — watch idempotency, the one test the
 * spec does ask for — passing against rows that were never written, or written into the
 * database you develop against and left there. These tests are what test 3 stands on.
 */

const database = setUpTestDatabase("mediasafe_access_test");

/**
 * A stand-in for the owned tables that build step 2 brings — `library_entry`, `watch`,
 * `list`, `list_membership`, each of them `user_id text NOT NULL`.
 *
 * It lives here rather than in `db/schema.ts` because it is not part of the schema:
 * it is created inside a test's transaction and vanishes with the rollback. What it
 * buys is that `ownedBy` is exercised as real SQL against real Postgres rather than
 * asserted against its own string output.
 */
const fixtureOwned = pgTable("fixture_owned", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
});

/** A second owned table, for the one test about scoping by the wrong one. */
const fixtureOther = pgTable("fixture_other", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
});

async function createFixtureTable(tx: Transaction) {
  await tx.execute(
    sql`create table fixture_owned (id text primary key, user_id text not null)`,
  );
}

/**
 * A compile-time assertion, deliberately not an `it()`.
 *
 * `title` and `episode` are global and shared across accounts: no `user_id`
 * to filter, and no user to filter it by. `ownedBy` must refuse them. There is no
 * runtime behaviour to assert here — the check is that `tsc` reports an error on the
 * line below, and it is carried by `npm run typecheck`, not by vitest. If `ownedBy` ever
 * accepted an unowned table, the directive would become unused and typecheck would fail.
 */
const unownedFixture = pgTable("fixture_unowned", { id: text("id").primaryKey() });
// @ts-expect-error — a table with no `user_id` column is not an OwnedTable.
void ((): SQL => ownedBy(asUserId("alice"), unownedFixture));

describe("the Postgres test harness", () => {
  it("runs against its own migrated database, not the one you develop against", async () => {
    await inTransaction(async (tx) => {
      const facts = await tx.execute<{ database: string }>(
        sql`select current_database() as database`,
      );
      // If the harness ever fell back to the application pool, this would read
      // `mediasafe` — the database `npm run dev` uses — and every test below would be
      // writing into it.
      expect(facts.rows[0].database).toBe("mediasafe_access_test");

      // Applied by `db/migrate.ts`, which is the runner production runs. The bookkeeping
      // table exists only because that runner opened it here.
      const migrations = await tx.execute<{ present: string | null }>(
        sql`select to_regclass('drizzle.__drizzle_migrations') as present`,
      );
      expect(migrations.rows[0].present).not.toBeNull();
    });
  });

  it("rolls each test back, leaving no residue for the next", async () => {
    await inTransaction(async (tx) => {
      await createFixtureTable(tx);
      await tx.insert(fixtureOwned).values({ id: "a", userId: "alice" });

      const present = await tx.execute<{ present: string | null }>(
        sql`select to_regclass('public.fixture_owned') as present`,
      );
      expect(present.rows[0].present).not.toBeNull();
    });

    // A second transaction, after the first has rolled back. Postgres rolls DDL back
    // like anything else, so a table created above must be gone — and if the rollback
    // were not happening, the next test's `create table` would fail rather than pass
    // quietly.
    await inTransaction(async (tx) => {
      const present = await tx.execute<{ present: string | null }>(
        sql`select to_regclass('public.fixture_owned') as present`,
      );
      expect(present.rows[0].present).toBeNull();
    });
  });

  it("returns what the test body returns", async () => {
    // The rollback is forced by throwing a sentinel out of Drizzle's transaction
    // callback, which is exactly how a return value gets lost. It does not.
    const answer = await inTransaction(async (tx) => {
      const result = await tx.execute<{ answer: number }>(sql`select 1 as answer`);
      return result.rows[0].answer;
    });

    expect(Number(answer)).toBe(1);
  });

  it("surfaces a failing query rather than swallowing it into a rollback", async () => {
    await expect(
      inTransaction(async (tx) => {
        await tx.execute(sql`select * from a_table_that_does_not_exist`);
      }),
    ).rejects.toThrow(/a_table_that_does_not_exist/);
  });

  it("names the database it created, so a test can prove which one it is on", () => {
    expect(database.connectionString()).toContain("mediasafe_access_test");
  });

  it("refuses the application pool, so a stray read cannot reach the dev database", () => {
    // The trap this closes: a function in `db/access.ts` that forgot to accept the
    // executor its caller passed would fall back to `getDb()`, write to the database
    // `npm run dev` uses, and leave it there — while every assertion in the transaction
    // above still passed. Loud instead.
    expect(() => getDb()).toThrow(/not available under test/);
  });
});

describe("the data-access choke point", () => {
  it("scopes a query to one user's rows and no one else's", async () => {
    await inTransaction(async (tx) => {
      await createFixtureTable(tx);
      await tx.insert(fixtureOwned).values([
        { id: "alice-1", userId: "alice" },
        { id: "alice-2", userId: "alice" },
        { id: "bob-1", userId: "bob" },
      ]);

      const alices = await tx
        .select({ id: fixtureOwned.id })
        .from(fixtureOwned)
        .where(ownedBy(asUserId("alice"), fixtureOwned));

      expect(alices.map((row) => row.id).sort()).toEqual(["alice-1", "alice-2"]);
    });
  });

  it("fails loudly when scoped by a table the query does not select from", async () => {
    await inTransaction(async (tx) => {
      await createFixtureTable(tx);
      await tx.execute(
        sql`create table fixture_other (id text primary key, user_id text not null)`,
      );

      // `ownedBy` takes a table, and nothing ties that table to the FROM clause — so
      // this builds `where fixture_other.user_id = 'alice'` over a select from
      // `fixture_owned`. The reason that is a documented limitation rather than a hole
      // is right here: Postgres rejects it on the first run instead of quietly
      // returning somebody else's rows.
      await expect(
        tx
          .select({ id: fixtureOwned.id })
          .from(fixtureOwned)
          .where(ownedBy(asUserId("alice"), fixtureOther)),
      ).rejects.toThrow(/fixture_other/);
    });
  });

  it("matches nothing for a user with no rows, rather than everything", async () => {
    await inTransaction(async (tx) => {
      await createFixtureTable(tx);
      await tx.insert(fixtureOwned).values({ id: "bob-1", userId: "bob" });

      // The failure this guards against is a predicate that degrades to `true` — the
      // shape of bug that turns one forgotten join into every account's library.
      const carols = await tx
        .select({ id: fixtureOwned.id })
        .from(fixtureOwned)
        .where(ownedBy(asUserId("carol"), fixtureOwned));

      expect(carols).toEqual([]);
    });
  });
});

/**
 * **The episode-to-entry read** — issue #289, and the one query that makes
 * `/episodes/{episodeId}` legal.
 *
 * The episode route carries one id. Two ids in a path can disagree — an entry from one
 * account beside an episode of another title is a URL anybody can type — and the answer
 * to that used to be a second `ownedBy` check inside `getTitleDetail`. One id cannot
 * disagree with itself, so the entry is resolved *from* the episode, and the ownership
 * check is the module's existing one rather than a new rule beside it.
 *
 * Against real Postgres, in the harness this file already stands up, because the property
 * is about a join and a predicate: an `ownedBy` that had drifted to `or` rather than
 * `and`, or an `innerJoin` that had become a `leftJoin`, is exactly the shape of mistake
 * that returns *somebody else's entry* while every unit test over a fake still passes.
 */
describe("resolving an episode to the library entry that holds it", () => {
  let seeded = 0;
  const nextNumber = () => ++seeded;

  async function seedUser(tx: Transaction, name: string): Promise<UserId> {
    const id = `${name}-${nextNumber()}`;
    await tx.insert(user).values({ id, name, email: `${id}@example.test` });
    return asUserId(id);
  }

  /** A show with one episode, and nobody holding it yet. */
  async function seedShow(tx: Transaction): Promise<{
    titleId: string;
    episodeId: string;
  }> {
    const number = nextNumber();
    const [row] = await tx
      .insert(title)
      .values({ kind: "show", tmdbId: number, name: `Show ${number}`, releaseYear: 2022 })
      .returning({ id: title.id });

    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: 1,
        episodeNo: 1,
        name: "Winter Is Coming",
      })
      .returning({ id: episode.id });

    return { titleId: row.id, episodeId: inserted.id };
  }

  async function addToLibrary(
    tx: Transaction,
    userId: UserId,
    titleId: string,
  ): Promise<string> {
    const [row] = await tx
      .insert(libraryEntry)
      .values({ userId, titleId })
      .returning({ id: libraryEntry.id });
    return row.id;
  }

  it("answers the entry the reader holds the episode's title through", async () => {
    await inTransaction(async (tx) => {
      const alice = await seedUser(tx, "alice");
      const show = await seedShow(tx);
      const entryId = await addToLibrary(tx, alice, show.titleId);

      expect(await libraryEntryIdForEpisode(alice, show.episodeId, tx)).toBe(entryId);
    });
  });

  it("answers nothing to a reader who does not hold the title", async () => {
    await inTransaction(async (tx) => {
      const alice = await seedUser(tx, "alice");
      const bob = await seedUser(tx, "bob");
      const show = await seedShow(tx);
      // Alice holds it; Bob is typing the same episode id into the same address.
      await addToLibrary(tx, alice, show.titleId);

      expect(await libraryEntryIdForEpisode(bob, show.episodeId, tx)).toBeNull();
    });
  });

  it("answers nothing — never someone else's entry — for an episode in no library", async () => {
    await inTransaction(async (tx) => {
      const alice = await seedUser(tx, "alice");
      // Alice holds a different show, so there is an entry of hers for a wrong join to
      // reach. A `leftJoin`, or a predicate that stopped naming the episode, answers it.
      const held = await seedShow(tx);
      await addToLibrary(tx, alice, held.titleId);
      const unheld = await seedShow(tx);

      expect(await libraryEntryIdForEpisode(alice, unheld.episodeId, tx)).toBeNull();
    });
  });
});
