import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { requireDatabaseUrl, withPool } from "./driver";
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from "./migrations-table";

/**
 * The migration runner.
 *
 * Same driver as the app — `drizzle-orm/neon-serverless` over a WebSocket `Pool` —
 * because the migrator needs an interactive transaction and Neon's HTTP interface has
 * none. Run this as the first half of the build command, so a migration that fails
 * fails the build, no deployment is created, and old code keeps serving an unchanged
 * schema (SPEC.md §6).
 *
 * ── SPEC.md §11.5, answered ──────────────────────────────────────────────────────
 *
 * *Does Drizzle's `migrate()` wrap each migration file in a transaction?*
 *
 * **It does better than that: it wraps the entire pending run in ONE transaction.**
 * Verified against drizzle-orm 0.45.2, in source and by test.
 *
 * `PgDialect.migrate()` opens a single `session.transaction()` and iterates every
 * pending migration file inside it, writing each file's `drizzle.__drizzle_migrations`
 * bookkeeping row in the same transaction. So a statement that fails anywhere in the
 * run rolls back everything in that run, including files that had already succeeded.
 * Halt-on-partial-failure holds, and **this runner does not open a transaction of its
 * own** — doing so would nest a redundant savepoint around a transaction that already
 * exists, and could not be opened around `migrate()` in any case, because the migrator
 * checks out its own client from the pool.
 *
 * Two consequences worth carrying forward:
 *
 *  - `CREATE SCHEMA IF NOT EXISTS drizzle` and the `__drizzle_migrations` table create
 *    run *before* that transaction opens. Both are `IF NOT EXISTS`, so there is no
 *    half-state to leave behind.
 *  - **Statements Postgres forbids inside a transaction block cannot be used in a
 *    migration** — `CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER SYSTEM`. drizzle-kit
 *    will happily emit `CREATE INDEX CONCURRENTLY` if a schema asks for it, and it will
 *    fail here at run time. Build step 2 adds indexes; use the plain, locking form.
 *
 * `tests/migrator-transaction.test.ts` asserts the property against a real Postgres, so
 * a future Drizzle release that quietly stops doing this fails a test rather than a
 * production deploy.
 */

export interface RunMigrationsOptions {
  /** Defaults to `DATABASE_URL`. */
  connectionString?: string;
  /** Defaults to the repository's `drizzle/` folder. */
  migrationsFolder?: string;
}

// Resolved against this file, not the working directory: the runner is invoked from
// npm scripts, from tests, and from the build command's first half, and only one of
// those reliably runs at the repository root.
const MIGRATIONS_FOLDER = path.join(import.meta.dirname, "..", "drizzle");

/**
 * Applies every pending migration, then closes the pool it opened.
 *
 * Throws on failure — it never swallows, and it never reports partial success. Callers
 * that need a process exit code should use the CLI entry point below; `tests/` and
 * issue #40's harness call this directly so that what they exercise is the runner
 * production uses, not a re-implementation of it.
 */
export async function runMigrations(
  options: RunMigrationsOptions = {},
): Promise<void> {
  const connectionString = options.connectionString ?? requireDatabaseUrl();
  const migrationsFolder = options.migrationsFolder ?? MIGRATIONS_FOLDER;

  await withPool(connectionString, (pool) =>
    migrate(drizzle(pool), {
      migrationsFolder,
      // Passed rather than left to the library's defaults, so drizzle-kit and the
      // runner are reading the same two constants.
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    }),
  );
}

/** True when this module was executed directly rather than imported. */
function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isCliEntry()) {
  runMigrations()
    .then(() => {
      console.log("[migrate] up to date");
    })
    .catch((error: unknown) => {
      // States the mechanism rather than asserting an outcome it cannot observe: the
      // whole run is one transaction, so a failure rolls it back.
      console.error(
        "[migrate] failed. The whole run is one transaction, so it was rolled back.",
      );
      console.error(error);
      // Non-zero so the build command's first half halts the build, and no deployment
      // is created against a schema that did not move.
      process.exitCode = 1;
    });
}
