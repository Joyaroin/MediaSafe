import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "./driver";
import * as schema from "./schema";

/**
 * The application's connection pool and Drizzle client — one per process.
 *
 * Built on first use rather than on import. Importing this module must not need a
 * database: `next build` evaluates every route's module graph while collecting page
 * data, and a pool constructed at import time turns "no DATABASE_URL" into a build
 * failure rather than a request failure. CI runs `build` as a signal check, and it
 * should not have to invent a fake connection string to do it.
 *
 * The failure is still loud, just moved to the first query — where issue #41's
 * `error.tsx` boundary is what catches it.
 *
 * This module is deliberately thin. Build step 1's data-access choke point, the module
 * that takes a session's user id and is the only thing that reads rows, is `db/access.ts`
 * and is built on top of this rather than instead of it.
 *
 * Nothing outside `db/` imports this. ESLint enforces it (`eslint.config.mjs`), because
 * "reads go through the choke point" is worth more as a check than as a convention.
 */

/** The application's Drizzle handle, bound to the process pool. */
export type Database = NeonDatabase<typeof schema>;

/**
 * A Drizzle handle inside an open transaction — what `db.transaction()` hands its
 * callback, and what the test harness hands a test body.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Whatever a query may be run against: the pool, or a transaction on it.
 *
 * `db/access.ts` takes one of these as its last argument so that a caller inside a
 * transaction — build step 4's watch write, and every test — runs on that transaction
 * rather than checking out a second connection that cannot see it.
 */
export type Executor = Database | Transaction;

function createClient() {
  const pool = createPool(requireDatabaseUrl());
  return { pool, db: drizzle(pool, { schema }) };
}

type Client = ReturnType<typeof createClient>;

// Next.js reloads server modules on every edit in development. Without this the pool is
// recreated per reload and connections leak until Postgres refuses new ones.
const globalForDb = globalThis as unknown as { mediasafeDbClient?: Client };

function getClient(): Client {
  const existing = globalForDb.mediasafeDbClient;
  if (existing) return existing;

  const client = createClient();
  globalForDb.mediasafeDbClient = client;
  return client;
}

export function getDb(): Client["db"] {
  /**
   * Under vitest this pool would be built from `DATABASE_URL`, which is the database you
   * develop against — not the migrated scratch database the harness created, and not
   * inside the transaction it is about to roll back. A test reaching here has found the
   * one silent failure the harness is designed to prevent: assertions that pass while
   * the rows go somewhere else and stay there.
   *
   * It means a function in `db/access.ts` did not take the executor its caller passed.
   * Nothing legitimate needs this pool in a test — `db/migrate.ts` and
   * `tests/support/scratch-database.ts` open their own through `db/driver.ts`.
   *
   * Application code that knows it is under test is a smell, and this is the knowing
   * exception. The alternatives were worse: a vitest `resolve.alias` onto a stub cannot
   * be asserted against and hides which module actually failed, and having the harness
   * poison `globalThis.mediasafeDbClient` moves the same coupling somewhere less
   * visible while depending on a private name. Three lines, here, where the pool is.
   */
  if (process.env.VITEST) {
    throw new Error(
      "The application pool is not available under test. Pass the executor from " +
        "inTransaction() — see tests/support/database.ts.",
    );
  }

  return getClient().db;
}
