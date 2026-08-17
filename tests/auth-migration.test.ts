import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { TIMEZONE_FALLBACK } from "@/lib/timezone";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Better Auth's tables, as they actually arrive in Postgres.
 *
 * `tests/auth-configuration.test.ts` asserts what the config asks for and what the
 * generated Drizzle schema says. This asserts what a database has after `db/migrate.ts`
 * — the runner a deploy runs — has been pointed at an empty one. The three can disagree,
 * and the only one a user ever meets is this one.
 *
 * What it is really checking is issue #42's first acceptance criterion: **one migration
 * history**. Better Auth ships a `migrate` command of its own that would create these
 * tables outside drizzle-kit's bookkeeping, and taking it would mean two tools writing
 * DDL to one database with no shared record of what had been applied. The evidence that
 * we did not take it is that these tables exist in a database only `db/migrate.ts`
 * touched.
 */

const database = setUpTestDatabase("mediasafe_auth_schema_test");

/** The four identity tables, plus the limiter's storage. */
const EXPECTED_TABLES = ["account", "rate_limit", "session", "user", "verification"];

describe("Better Auth's tables, after the one migration runner has run", () => {
  it("is a database the drizzle runner alone migrated", () => {
    expect(database.connectionString()).toContain("mediasafe_auth_schema_test");
  });

  it("has all five, created by drizzle-kit's migration and not by Better Auth's own", async () => {
    await inTransaction(async (tx) => {
      const tables = await tx.execute<{ table_name: string }>(
        sql`select table_name
              from information_schema.tables
             where table_schema = 'public'
             order by table_name`,
      );

      expect(tables.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
    });
  });

  it("records them in the one migration history", async () => {
    await inTransaction(async (tx) => {
      const applied = await tx.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );

      // One history, and every table above is in it. A second tool creating tables would
      // leave this count unchanged while the tables appeared anyway.
      expect(Number(applied.rows[0].count)).toBeGreaterThan(0);
    });
  });

  describe("user.timezone", () => {
    it("is NOT NULL, so no read downstream needs an or-else branch", async () => {
      await inTransaction(async (tx) => {
        const column = await tx.execute<{
          is_nullable: string;
          column_default: string | null;
          data_type: string;
        }>(
          sql`select is_nullable, column_default, data_type
                from information_schema.columns
               where table_schema = 'public'
                 and table_name = 'user'
                 and column_name = 'timezone'`,
        );

        expect(column.rows).toHaveLength(1);
        expect(column.rows[0].is_nullable).toBe("NO");
        expect(column.rows[0].data_type).toBe("text");
      });
    });

    it("defaults to a zone rather than to nothing", async () => {
      await inTransaction(async (tx) => {
        // Inserted without a zone on purpose: this is the account created by any path
        // that forgets the hook, and ADR-0001's read-time lens means it must still land
        // on something every later `AT TIME ZONE` can use.
        await tx.execute(
          sql`insert into "user" (id, name, email, email_verified, updated_at)
              values ('tz-default', 'Someone', 'someone@example.test', false, now())`,
        );

        const stored = await tx.execute<{ timezone: string }>(
          sql`select timezone from "user" where id = 'tz-default'`,
        );

        expect(stored.rows[0].timezone).toBe(TIMEZONE_FALLBACK);
      });
    });

    it("holds a zone Postgres itself will compute a day boundary with", async () => {
      await inTransaction(async (tx) => {
        // The point of the column, exercised. Build steps 5 and 6 write exactly this
        // shape against every past watch, so a value the column accepts but Postgres
        // cannot resolve is a query that throws for one account and nobody else.
        const bucketed = await tx.execute<{ day: string }>(
          sql`select (timestamptz '2026-08-17 23:30:00+00' at time zone ${TIMEZONE_FALLBACK})::date::text as day`,
        );

        expect(bucketed.rows[0].day).toBe("2026-08-17");
      });
    });
  });

  describe("the foreign keys account deletion will lean on", () => {
    it("cascades a session away with its user", async () => {
      await inTransaction(async (tx) => {
        await tx.execute(
          sql`insert into "user" (id, name, email, email_verified, updated_at)
              values ('cascade-1', 'Someone', 'cascade@example.test', false, now())`,
        );
        await tx.execute(
          sql`insert into "session" (id, expires_at, token, updated_at, user_id)
              values ('s-1', now() + interval '1 year', 'token-1', now(), 'cascade-1')`,
        );

        await tx.execute(sql`delete from "user" where id = 'cascade-1'`);

        const sessions = await tx.execute<{ count: string }>(
          sql`select count(*)::text as count from "session" where user_id = 'cascade-1'`,
        );
        // ADR-0001 gives every owned table `ON DELETE CASCADE` back to `user`. Step 7's
        // delete-account page is a `delete from "user"` and nothing else, and this is
        // why that is enough.
        expect(sessions.rows[0].count).toBe("0");
      });
    });
  });

  it("holds one account per email, so two Google sign-ins are one user", async () => {
    await inTransaction(async (tx) => {
      await tx.execute(
        sql`insert into "user" (id, name, email, email_verified, updated_at)
            values ('dupe-1', 'Someone', 'dupe@example.test', false, now())`,
      );

      // Asserted against the constraint Postgres names, not against the message Drizzle
      // wraps it in: the wrapper prints the failing SQL and nothing about why, so a
      // match on it would pass for any failure at all — including the table not being
      // there.
      const rejection = await tx
        .execute(
          sql`insert into "user" (id, name, email, email_verified, updated_at)
              values ('dupe-2', 'Someone Else', 'dupe@example.test', false, now())`,
        )
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(rejection).not.toBeNull();
      expect((rejection as { cause?: { constraint?: string } }).cause?.constraint).toBe(
        "user_email_unique",
      );
    });
  });
});
