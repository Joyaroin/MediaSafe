import { eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * The data-access choke point: the only module that reads or writes owned rows.
 *
 * ── Why one place ────────────────────────────────────────────────────────────────────
 *
 * There is no row-level security. SPEC.md §6 rules it out for a reason `tvtracker` had
 * to learn twice: Neon's connection owns the tables, so it bypasses policies, and a
 * policy that is bypassed is worse than no policy because it reads like protection.
 *
 * So **one filtered column, in one place, is the entire isolation mechanism.** Every
 * owned table carries `user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE`
 * (ADR-0001), and the only thing standing between one account's library and another's is
 * that the predicate is actually there.
 *
 * ── What that is, exactly, and what it is not ────────────────────────────────────────
 *
 * Be precise about the guarantee, because overstating it is how it stops being checked.
 * Inside this module a bare `eq(watch.userId, …)`, or a `where` left off entirely, still
 * compiles. Nothing makes the filter unforgettable.
 *
 * What is enforced is narrower and still worth having: **ESLint confines every query in
 * the codebase to this file** (`eslint.config.mjs` — no other module may import
 * `db/client`, `db/driver` or `drizzle-orm`, by any specifier). So the surface on which a
 * `user_id` filter can be forgotten is one short module that exists to be read for that,
 * rather than every server component in the app. `ownedBy` then makes the filter one
 * greppable expression, and makes pointing it at an unowned table a type error.
 *
 * A gate that genuinely could not be got past would have to own every query shape build
 * step 2 needs — joins, `and()`, partial column lists, the derived-state views. Written
 * now it would be bypassed by the third real query and would then be worse than this,
 * because it would still read like a gate.
 *
 * ── The shape, which is the deliverable ──────────────────────────────────────────────
 *
 * 1. **Every exported function takes the user id as its first argument.** Never a
 *    session, never a request, never `headers()`. A function that resolves its own
 *    caller cannot be called for a different user in a test, an import, or a nightly
 *    job — and, worse, it is a second place where "who is this" gets decided.
 * 2. **Session-to-user-id resolution happens once, at the boundary**, in
 *    `lib/session.ts`. Nothing here imports it. The direction of that dependency is the
 *    property: auth knows about the database, the database knows nothing about auth.
 * 3. **The executor is the last argument and defaults to the pool** —
 *    `(userId, …, executor: Executor = getDb())`. A caller already inside a transaction
 *    passes it; everyone else ignores it. A default argument is evaluated per call, so
 *    importing this module still never opens a connection, and there is no ambient
 *    context to forget to enter.
 *
 *    That default is the production path and is deliberately never exercised by a test:
 *    `getDb()` throws under vitest, and the harness always passes its transaction. A
 *    test that trips the default has found a function that ignored the executor it was
 *    given, which is the bug the throw exists to name.
 *
 * `ownedBy` is currently the whole module, because at build step 1 there are no library
 * entries and no watches to read. It is built anyway (issue #40): a later step that
 * finds no module here reaches for the database directly, and the choke point stops
 * being one the first time that happens.
 *
 * `title` and `episode` are global and unowned — one row per TMDB id, shared across
 * accounts (ADR-0001). Reads of those take no user id and cannot be scoped, which is why
 * `ownedBy` will not typecheck against them.
 */

declare const userIdBrand: unique symbol;

/**
 * Better Auth's `user.id` — `text`, not a uuid — and branded, so that it is not
 * interchangeable with the other strings this app is about to be full of.
 *
 * ADR-0001 gives `library_entry`, `watch`, `list` and `list_membership` a uuid `id` of
 * their own alongside `user_id`, and `watch` carries a `source_key`. Read into variables,
 * those are all `string`, and so is a user id — so `readWatches(entryId)` against a
 * signature expecting a user id compiles clean and scopes to nobody's rows, which is the
 * benign half of that mistake.
 *
 * The cost is one cast, in `lib/session.ts`, at the boundary that mints the value. That
 * is the trade: one cast where a human is looking, in exchange for the compiler checking
 * every call site build steps 2-4 add.
 */
export type UserId = string & { readonly [userIdBrand]: true };

/**
 * Marks a string as a user id. The one honest use is `lib/session.ts`, on the id Better
 * Auth just resolved from a session; tests use it on their own fixtures. Anywhere else
 * it is a cast wearing a function's clothes.
 */
export function asUserId(id: string): UserId {
  return id as UserId;
}

/**
 * Any table with a `user_id` column: `library_entry`, `watch`, `list`,
 * `list_membership`. Structural on purpose — a table gains ownership by carrying the
 * column, not by being added to a list here that could fall out of date.
 */
export interface OwnedTable {
  userId: PgColumn;
}

/**
 * The predicate that scopes a query to one account, and the single expression the whole
 * isolation model rests on.
 *
 * Every read and write of an owned table goes through this rather than writing
 * `eq(table.userId, userId)` at the call site. That buys two things: the filter is
 * greppable in one place, and passing an unowned table (`title`, `episode`) is a type
 * error rather than a query that quietly returns everybody's rows.
 *
 * It is not a `where` clause on its own — a query that needs more conditions combines it
 * with `and()`. What it is is the condition that may never be the one left out.
 *
 * One thing it does not check: `table` is not tied to the table the query selects from,
 * so `ownedBy(userId, watch)` on a select from `library_entry` builds a predicate against
 * a table that is not in the FROM clause. Postgres rejects that outright — it is a loud
 * error at the first run, not a silent leak — which is why the fix is not a signature
 * that could only bind them by owning the whole query builder.
 */
export function ownedBy(userId: UserId, table: OwnedTable): SQL {
  return eq(table.userId, userId);
}
