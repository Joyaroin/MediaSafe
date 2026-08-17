import type { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { afterAll, beforeAll } from "vitest";

import type { Database, Transaction } from "@/db/client";
import { createPool } from "@/db/driver";
import { runMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { createScratchDatabase, type ScratchDatabase } from "./scratch-database";

/**
 * The row-level test harness: a real Postgres, real migrations, one transaction per
 * test, rolled back.
 *
 * ── What it is not ───────────────────────────────────────────────────────────────────
 *
 * There is no in-memory substitute and no mocked constraint (SPEC.md §6). The properties
 * worth testing here — `UNIQUE (user_id, source, source_key)`, `ON DELETE CASCADE`, the
 * derived-state views — live in Postgres, and a mock of a unique constraint tests the
 * mock. Migrations are applied by `db/migrate.ts`, the runner production runs, so a
 * migration that would fail in production fails here first.
 *
 * ── Isolation ────────────────────────────────────────────────────────────────────────
 *
 * Each test runs inside a transaction that is always rolled back, so no test can see
 * another's rows and none of them leave residue. Postgres rolls DDL back too, which is
 * what lets a test create a fixture table and have it vanish.
 *
 * The database itself is created and dropped per test file rather than shared with the
 * one you develop against — a rollback protects the rows, but the migration run would
 * still touch whatever database it was pointed at.
 *
 * This is the opposite trade to `scratch-database.ts`'s own users: the migrator tests
 * cannot roll back, because the transaction is the thing they are testing.
 *
 * ── Growing it ───────────────────────────────────────────────────────────────────────
 *
 * Step 4's watch-idempotency assertions (SPEC.md §6, test 3) add a file that calls
 * `setUpTestDatabase` and `inTransaction` and nothing else. That is the whole point of
 * building this now: the assertions arrive, the infrastructure does not.
 */

export interface TestDatabase {
  /** The scratch database's URL. Present mostly so a test can prove which one it is. */
  connectionString: () => string;
  /** The Drizzle handle bound to this file's pool. Prefer `inTransaction`. */
  db: () => Database;
}

interface Harness {
  pool: Pool;
  db: Database;
  connectionString: string;
  dropDatabase: () => Promise<void>;
}

/**
 * Set by `setUpTestDatabase`'s `beforeAll` and cleared by its `afterAll`, so a test that runs
 * without one gets a named error rather than a connection to nowhere.
 */
let harness: Harness | null = null;

function current(): Harness {
  if (!harness) {
    throw new Error(
      "No test database. Call setUpTestDatabase(name) at the top level of the test file.",
    );
  }
  return harness;
}

/**
 * Registers the per-file lifecycle: create the database, migrate it with the production
 * runner, open a pool; then close the pool and drop the database.
 *
 * `name` is a Postgres database name, so it must be unique across test files —
 * `vitest.config.mts` runs files sequentially, and two files sharing a name would take
 * turns dropping each other's.
 */
export function setUpTestDatabase(name: string): TestDatabase {
  beforeAll(async () => {
    const scratch: ScratchDatabase = await createScratchDatabase(name);
    // Deliberately the real runner, not `drizzle-kit push` and not a hand-rolled
    // `CREATE TABLE`: what the tests run against has to be what a deploy produces.
    await runMigrations({ connectionString: scratch.connectionString });

    const pool = createPool(scratch.connectionString);
    harness = {
      pool,
      db: drizzle(pool, { schema }),
      connectionString: scratch.connectionString,
      dropDatabase: scratch.drop,
    };
  }, 60_000);

  afterAll(async () => {
    const open = harness;
    harness = null;
    if (!open) return;

    // The pool first. `DROP DATABASE ... WITH (FORCE)` would evict these connections
    // anyway, but a pool torn down under itself logs an error nobody caused.
    await open.pool.end();
    await open.dropDatabase();
  }, 60_000);

  return {
    connectionString: () => current().connectionString,
    db: () => current().db,
  };
}

/**
 * The sentinel thrown to force a rollback.
 *
 * Drizzle's transaction wrapper issues `ROLLBACK` and rethrows whatever came out of the
 * callback (verified in `drizzle-orm/neon-serverless/session.js`), so throwing is the
 * only way to roll back a transaction whose body succeeded. Matched by identity rather
 * than by message, so that a test provoking its own error can never be mistaken for it.
 */
const ROLLBACK = new Error("The test harness always rolls back.");

/**
 * Runs `body` inside a transaction and rolls it back, returning whatever `body`
 * returned.
 *
 * A failure inside `body` — a failed assertion, a constraint violation the test was
 * provoking, a bug — propagates unchanged. The rollback happens either way; only the
 * error tells you which it was.
 */
export async function inTransaction<T>(
  body: (tx: Transaction) => Promise<T>,
): Promise<T> {
  let result: T;
  let completed = false;

  try {
    await current().db.transaction(async (tx) => {
      result = await body(tx);
      completed = true;
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  if (!completed) {
    // Unreachable unless Drizzle stops rethrowing, which would mean every test in the
    // suite was silently passing on an undefined result.
    throw new Error("The transaction body did not run to completion.");
  }

  return result!;
}
