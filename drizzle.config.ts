import "dotenv/config";

import { defineConfig } from "drizzle-kit";

import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from "./db/migrations-table";

/**
 * drizzle-kit's half of the pipeline: `generate` diffs `db/schema.ts` against the
 * snapshots in `drizzle/meta/` and writes plain `.sql` into `drizzle/`.
 *
 * Plain SQL, committed and hand-editable, is not a preference — `squawk` lints SQL
 * *text*, so a TypeScript migration would be unlintable and
 * expand-contract would stop being mechanically checkable. Generated files are meant to
 * be read and edited before they are committed; drizzle-kit records their hash at run
 * time, not at generate time, so an edit is honoured rather than detected.
 *
 * `drizzle-kit` connects over plain TCP rather than through the WebSocket proxy, which
 * is why the same `DATABASE_URL` has to be reachable both ways. `db/migrate.ts` — not
 * `drizzle-kit push` — is what applies migrations, in every environment.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  migrations: {
    // The same two constants `db/migrate.ts` passes to the runner, so the generator
    // and the applier cannot drift onto two different tables.
    table: MIGRATIONS_TABLE,
    schema: MIGRATIONS_SCHEMA,
  },
  // `--> statement-breakpoint` markers, so one file's statements are executed
  // separately rather than as one multi-statement string.
  breakpoints: true,
  strict: true,
  verbose: true,
});
