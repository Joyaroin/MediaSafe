import "dotenv/config";

import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit's half of the pipeline: `generate` diffs `db/schema.ts` against the
 * snapshots in `drizzle/meta/` and writes plain `.sql` into `drizzle/`.
 *
 * Plain SQL, committed and hand-editable, is not a preference — `squawk` lints SQL
 * *text* (SPEC.md §6, test 4), so a TypeScript migration would be unlintable and
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
    // Matches the defaults `db/migrate.ts` runs with. Named rather than assumed, so
    // the two halves cannot drift apart silently.
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  // `--> statement-breakpoint` markers, so one file's statements are executed
  // separately rather than as one multi-statement string.
  breakpoints: true,
  strict: true,
  verbose: true,
});
