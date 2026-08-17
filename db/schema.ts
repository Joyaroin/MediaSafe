/**
 * The Drizzle schema, and the input to `drizzle-kit generate`.
 *
 * ── One schema, one migration history ────────────────────────────────────────────────
 *
 * Better Auth's tables are **generated**, into `auth-schema.ts`, by
 * `npm run auth:generate` — and then re-exported from here so that drizzle-kit sees one
 * schema file and emits one migration history. That is the requirement in issue #42, and
 * it is what later makes `library_entry.user_id → user.id ON DELETE CASCADE` an ordinary
 * foreign key rather than two migration tools racing on one database. Better Auth's own
 * `migrate` command is never run; `db/migrate.ts` applies everything, in every
 * environment.
 *
 * **Nothing is hand-edited in `auth-schema.ts`.** The CLI overwrites that file whole. A
 * column added to it by hand survives exactly until the next regeneration, at which point
 * it vanishes from the schema drizzle-kit diffs against and the following migration drops
 * it — taking the data with it. `user.timezone` is therefore declared as an
 * `additionalFields` entry in `lib/auth.ts`, where regeneration reproduces it. If a
 * column is needed on one of those five tables, that is where it goes.
 *
 * ── What is here and what is not ─────────────────────────────────────────────────────
 *
 * Five tables, all Better Auth's: `user`, `session`, `account` and `verification` carry
 * identity, and `rate_limit` is the limiter's storage (SPEC.md §6 — in Postgres, not in
 * the memory of one serverless instance).
 *
 * MediaSafe's own six — `title`, `episode`, `library_entry`, `watch`, `list`,
 * `list_membership` — are build step 2, whole, in one migration, per SPEC.md §5 and
 * ADR-0001. They are declared by hand, in `db/tables.ts`; only Better Auth's tables come
 * through the generator.
 *
 * Alongside them, in `db/views.ts`, are the three derived-state views —
 * `library_entry_state`, `library_entry_progress` and `library_entry_up_next`. They are
 * declared here rather than written as query helpers so that drizzle-kit emits them into
 * the same migration and `squawk` can read them: the five states, progress and up next
 * are defined in the database, once, and changing one is a migration with a diff.
 *
 * This file is drizzle-kit's single entry point (`drizzle.config.ts`), so everything it
 * must see is re-exported from here.
 *
 * Two columns in the generated file are worth naming here, because both look at first
 * glance like the thing issue #42 forbids and neither is:
 *
 *  - **`user.email`** holds the address Google returned. It is not a field anybody types
 *    into — there is no email input anywhere in the product, and no sign-in path that
 *    takes one.
 *  - **`account.password`** is part of Better Auth's own `account` shape and is nullable.
 *    Nothing writes it: `emailAndPassword` is off in `lib/auth.ts`, so no code path in
 *    this application can put a value there.
 *
 * `CONTEXT.md` is binding on every table and column name that appears here. Better Auth's
 * five are its vocabulary rather than ours, and they do not collide with it.
 */

export * from "@/auth-schema";
export * from "./tables";
export * from "./views";
