import { requireDatabaseUrl, withPool } from "@/db/driver";

/**
 * A throwaway database, created and dropped per test file.
 *
 * Migrations are schema changes, so they cannot be isolated by rolling back a
 * transaction — the thing under test *is* the transaction. A separate database is the
 * only isolation that works here, and it keeps `npm test` from destroying the migration
 * history in the database you develop against.
 *
 * Issue #40's harness is a different shape: it isolates by transaction rollback, which
 * is right for row-level tests and wrong for these.
 */

function replaceDatabaseName(connectionString: string, name: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  return url.toString();
}

export interface ScratchDatabase {
  connectionString: string;
  drop: () => Promise<void>;
}

export async function createScratchDatabase(
  name: string,
): Promise<ScratchDatabase> {
  const adminUrl = requireDatabaseUrl();

  // `CREATE DATABASE` cannot run inside a transaction block, which is why these are
  // bare queries rather than anything wrapped.
  await withPool(adminUrl, async (admin) => {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  });

  return {
    connectionString: replaceDatabaseName(adminUrl, name),
    drop: () =>
      withPool(adminUrl, async (admin) => {
        await admin.query(`drop database if exists "${name}" with (force)`);
      }),
  };
}
