import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
  MIGRATIONS_TABLE_QUALIFIED,
} from "@/db/migrations-table";

/**
 * The tracer bullet: the thinnest complete path from a browser, through the app, over a
 * WebSocket `Pool`, into Postgres, and back. Nothing on this page is hardcoded and
 * nothing is mocked — if the database is unreachable, this read throws.
 *
 * It reads server facts and the migration history rather than application rows, because
 * there are no application tables yet: Better Auth's four are issue #42 and MediaSafe's
 * six are build step 2. It therefore has no user id to take, and is not the data-access
 * choke point's business (issue #40) — that module guards *owned rows*, and there are
 * none here.
 *
 * This page is replaced, not extended. Build step 1 repoints `/` at the signed-in
 * shell, and step 2 repoints it again at the library.
 */

// Never prerendered and never cached: a database round-trip that a build could satisfy
// from a snapshot would prove nothing.
export const dynamic = "force-dynamic";

interface ServerFacts extends Record<string, unknown> {
  version: string;
  database: string;
  now: string;
}

interface AppliedMigration extends Record<string, unknown> {
  id: number;
  hash: string;
  created_at: string | null;
}

async function readPressCheck(): Promise<{
  facts: ServerFacts;
  migrations: AppliedMigration[];
}> {
  const db = getDb();

  // No `try`, and so no `catch` that could return `[]`. Constraint 2: empty and failed
  // are structurally separate, and an empty migration history has to be reachable only
  // by a query that succeeded and found nothing. A failure here throws, and issue #41's
  // `error.tsx` boundary is what catches it.
  //
  // The timestamp is formatted in SQL rather than parsed here: what the driver hands
  // back for a `timestamptz` is its business, and a press check should not depend on it.
  const facts = await db.execute<ServerFacts>(
    sql`select
          version() as version,
          current_database() as database,
          to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as now`,
  );

  // The migrations table is created by the runner itself, so on a database that has
  // never been migrated it does not exist. `to_regclass` returns NULL rather than
  // raising, which keeps "never migrated" distinguishable from "migration read failed".
  const tableExists = await db.execute<{ present: string | null }>(
    sql`select to_regclass(${MIGRATIONS_TABLE_QUALIFIED}) as present`,
  );

  const migrations = tableExists.rows[0]?.present
    ? (
        await db.execute<AppliedMigration>(
          sql`select id, hash, created_at
                from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)}
               order by created_at asc`,
        )
      ).rows
    : [];

  return { facts: facts.rows[0], migrations };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-rule py-3">
      <dt className="code-line text-stock-dim">{label}</dt>
      <dd className="mt-1.5 text-item text-stock break-words" data-numeric>
        {value}
      </dd>
    </div>
  );
}

export default async function PressCheckPage() {
  const { facts, migrations } = await readPressCheck();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="code-line text-signal">Press check</p>

      <h1 className="bill-title mt-4 text-bill-lg text-stock">
        The path is open
      </h1>

      <p className="mt-5 max-w-[62ch] text-note leading-relaxed text-stock-dim">
        Everything below was read from Postgres when this page was requested — through
        the same WebSocket pool and the same driver that production uses. Nothing here
        is a fixture. When there is a library to show, this page is replaced by it.
      </p>

      <dl className="mt-10">
        <Fact label="Server" value={facts.version} />
        <Fact label="Database" value={facts.database} />
        <Fact label="Server time (UTC)" value={facts.now} />
      </dl>

      <h2 className="bill-title mt-14 text-bill-sm text-stock">Migrations applied</h2>

      {migrations.length === 0 ? (
        <p className="mt-4 max-w-[62ch] text-note leading-relaxed text-stock-dim">
          None yet. The runner has prepared its own bookkeeping and found no migration
          files to apply — the schema arrives with the tables that need it.
        </p>
      ) : (
        <ol className="mt-4">
          {migrations.map((migration) => (
            <li
              key={migration.id}
              className="flex items-baseline justify-between gap-6 border-t border-rule py-3"
            >
              <span className="text-item text-stock break-all">{migration.hash}</span>
              <span className="code-line shrink-0 text-stock-dim" data-numeric>
                {/* Not "undated" — CONTEXT.md gives that word to a watch with no
                    timestamp, and this is a migration row. */}
                {migration.created_at
                  ? new Date(Number(migration.created_at)).toISOString()
                  : "no timestamp"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
