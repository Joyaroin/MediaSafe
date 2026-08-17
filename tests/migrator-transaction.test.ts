import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPool } from "@/db/driver";
import { runMigrations } from "@/db/migrate";
import {
  createScratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-database";

/**
 * `SPEC.md` §11.5, held open by ADR-0001 and closed here:
 * **does Drizzle's `migrate()` wrap each migration file in a transaction?**
 *
 * It wraps more than that. `PgDialect.migrate()` opens one transaction and runs *every*
 * pending file inside it, so a failure anywhere rolls back the whole run — including
 * files that had already succeeded, and including the `__drizzle_migrations` bookkeeping
 * rows. `db/migrate.ts` therefore opens no transaction of its own.
 *
 * ── Why this test exists, when SPEC.md §6 says four tests earn their keep ──────────
 *
 * This is a fifth, and it is added knowingly. The rule's reasoning is that everything
 * else "fails loudly and cheaply to an app used daily by its owner". A Drizzle upgrade
 * that quietly stopped wrapping the run would fail neither loudly nor cheaply: it would
 * fail as a half-applied production schema, which is the one failure `main`-is-
 * production has no recovery for and which Neon Free's six hours of history is the only
 * protection against. The property under test is a third-party dependency's behaviour,
 * it is the sole reason the runner does not open its own transaction, and it is
 * invisible until the day it matters.
 *
 * Delete this and the runner must open the transaction itself instead. One or the other
 * has to be true.
 */

const fixture = (name: string) =>
  path.join(import.meta.dirname, "fixtures", "migrations", name);

async function tableExists(
  connectionString: string,
  table: string,
): Promise<boolean> {
  const pool = createPool(connectionString);
  try {
    const result = await pool.query<{ present: string | null }>(
      "select to_regclass($1) as present",
      [`public.${table}`],
    );
    return result.rows[0].present !== null;
  } finally {
    await pool.end();
  }
}

async function appliedMigrationCount(connectionString: string): Promise<number> {
  const pool = createPool(connectionString);
  try {
    const present = await pool.query<{ present: string | null }>(
      "select to_regclass('drizzle.__drizzle_migrations') as present",
    );
    if (present.rows[0].present === null) return 0;

    const result = await pool.query<{ count: string }>(
      "select count(*)::text as count from drizzle.__drizzle_migrations",
    );
    return Number(result.rows[0].count);
  } finally {
    await pool.end();
  }
}

describe("the migration runner", () => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createScratchDatabase("mediasafe_migrator_test");
  }, 30_000);

  afterAll(async () => {
    await scratch.drop();
  }, 30_000);

  it("applies every pending file and records each one", async () => {
    await runMigrations({
      connectionString: scratch.connectionString,
      migrationsFolder: fixture("succeeds"),
    });

    expect(await tableExists(scratch.connectionString, "tracer_first")).toBe(true);
    expect(await tableExists(scratch.connectionString, "tracer_second")).toBe(true);
    expect(await appliedMigrationCount(scratch.connectionString)).toBe(2);
  });

  it("rolls the whole run back when a migration fails partway", async () => {
    // A second scratch database, because the assertion is about what a *failed* run
    // leaves behind and the test above deliberately left tables standing.
    const failing = await createScratchDatabase("mediasafe_migrator_failure_test");

    try {
      await expect(
        runMigrations({
          connectionString: failing.connectionString,
          migrationsFolder: fixture("fails-partway"),
        }),
      ).rejects.toThrow(/tracer_absent/);

      // The failing statement is in the *second* file. If each file were its own
      // transaction, `tracer_first` would have survived; if there were no transaction
      // at all, `tracer_second` would have survived too.
      expect(await tableExists(failing.connectionString, "tracer_second")).toBe(false);
      expect(await tableExists(failing.connectionString, "tracer_first")).toBe(false);

      // And nothing was recorded as applied, so a retry starts from a clean schema
      // rather than from a history that disagrees with it.
      expect(await appliedMigrationCount(failing.connectionString)).toBe(0);
    } finally {
      await failing.drop();
    }
  }, 30_000);
});
