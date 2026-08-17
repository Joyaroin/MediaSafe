/**
 * Where Drizzle records which migrations have been applied.
 *
 * One definition, imported by everything that names it: `drizzle.config.ts` (which
 * tells drizzle-kit), `db/migrate.ts` (which tells the runner), the page that reads the
 * history, and the tests that assert on it. These are Drizzle's own defaults, but
 * declaring them means drizzle-kit and the runner cannot drift onto two different
 * tables and silently re-apply a migration that had already run.
 *
 * Kept free of imports so `drizzle.config.ts` can read it without pulling in the driver.
 */

export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__drizzle_migrations";

/** Qualified name, for the raw SQL that reads the history. */
export const MIGRATIONS_TABLE_QUALIFIED = `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`;
