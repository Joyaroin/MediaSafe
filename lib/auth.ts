import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import * as authSchema from "@/auth-schema";
/* eslint-disable-next-line no-restricted-imports --
 * The one module outside `db/` that may hold the connection, and the narrowest reason
 * for it: Better Auth owns four tables of its own and does its own SQL against them. It
 * is not reading owned rows, so `db/access.ts` has nothing to offer it — that module
 * guards `library_entry`, `watch`, `list` and `list_membership`, and none of those are
 * here.
 *
 * The direction of the dependency is what is being protected, and it still holds:
 * **auth knows about the database, the database knows nothing about auth.** The
 * alternative — a `db/auth-adapter.ts` inside the choke point — would have inverted it
 * and put Better Auth's name in `db/`, which is the thing `db/access.ts` says must not
 * happen. `eslint.config.mjs` names this file, and only this file, for the exemption.
 */
import { getDb } from "@/db/client";
import { signupTimezoneFrom, TIMEZONE_FALLBACK } from "@/lib/timezone";

/**
 * Better Auth, self-hosted against the same Postgres as everything else.
 *
 * ── Google, and nothing else ─────────────────────────────────────────────────────────
 *
 * SPEC.md §6: **no password, no magic link, no email field anywhere in the system.** That
 * is not a default being left alone — `emailAndPassword` is written out below and turned
 * off, so that the day someone reaches for a password the diff says so. #8 chose Google
 * partly *because* it works on a borrowed browser, which is also why account deletion is
 * self-serve at step 7.
 *
 * ── Why the instance is built on first use and not at import ─────────────────────────
 *
 * `betterAuth()` starts its own async init the moment it is called: it resolves the
 * adapter, which calls `getDb()`, which needs `DATABASE_URL`. Called at module scope that
 * would mean three separate breakages, none of them at a useful moment:
 *
 *  - `next build` walks every route's module graph, and CI builds with no `DATABASE_URL`
 *    and no secret **on purpose** (`.github/workflows/ci.yml` — "CI must never be able to
 *    migrate anything"). The rejection would land as an unhandled rejection in a build
 *    worker rather than as a message.
 *  - `getDb()` throws under vitest by design (`db/client.ts`), so any test that so much as
 *    imported this file would fail on the import.
 *  - Better Auth throws on a missing secret when `NODE_ENV` is production — which is what
 *    `next build` sets.
 *
 * `db/client.ts` already holds this rule for the pool: *importing this module must not
 * need a database.* This is the same rule one layer up. The failure is not softened, only
 * moved to the first request, where issue #41's boundary is what catches it and the
 * reader gets a sentence and a reference id instead of a white page.
 *
 * ── Why the options are exported separately ──────────────────────────────────────────
 *
 * `authOptions` is plain data with no side effects, and two things read it: the Better
 * Auth CLI, through `auth.config.ts`, when it regenerates `auth-schema.ts`; and
 * `tests/auth-configuration.test.ts`, which asserts the things this file promises above.
 * The CLI reading exactly what the test asserts is the point — a claim about the schema
 * that is checked against the same object the generator was pointed at.
 */

/**
 * Empty rather than throwing.
 *
 * To be exact about when this runs, because the paragraph above is about deferral and
 * this is not deferred: `authOptions` is a module-scope object literal, so this — and the
 * `secret` and `baseURL` reads below — happen **at import**, like any other property in a
 * literal. That is fine and is not what the laziness above is protecting. Reading an
 * absent environment variable costs nothing and cannot fail; what would fail is opening
 * the pool and validating the secret, and both of those are inside `betterAuth()`, which
 * `getAuth()` is what defers.
 *
 * Empty rather than throwing, then, because Better Auth's own validation produces a better
 * message than a second one here would — and because a missing Google credential has to
 * fail the sign-in attempt, where issue #41's boundary is, rather than the import, where
 * `next build` is.
 */
function credential(name: string): string {
  return process.env[name] ?? "";
}

export const authOptions = {
  /**
   * A function rather than an adapter, so nothing opens a connection until Better Auth
   * actually initialises. `getDb()` is the same process-wide pool the rest of the app
   * uses — one pool, one driver, one data path (SPEC.md §3.1).
   */
  database: (options: BetterAuthOptions) =>
    drizzleAdapter(getDb(), {
      provider: "pg",
      // The generated tables, by the names the CLI wrote them under. Passing the schema
      // is what makes the adapter use these tables rather than reflecting names.
      schema: authSchema,
    })(options),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  /**
   * Off, in writing. See above — this is the single most important line in the file to
   * find in a diff.
   */
  emailAndPassword: { enabled: false },

  socialProviders: {
    google: {
      clientId: credential("GOOGLE_CLIENT_ID"),
      clientSecret: credential("GOOGLE_CLIENT_SECRET"),
    },
  },

  user: {
    additionalFields: {
      /**
       * `user.timezone`, declared here rather than patched into `auth-schema.ts`.
       *
       * That is the whole requirement and it is a mechanical one: `auth-schema.ts` is
       * generated, and the CLI overwrites it. A column added by hand survives exactly
       * until the next `npm run auth:generate` — at which point it disappears from the
       * schema drizzle-kit diffs against, and the *next* migration drops it. Declared
       * here, it is regenerated every time instead.
       *
       * `input: false` because nothing a client sends may set it. The zone comes from
       * the cookie the sign-in control wrote, through the hook below, and step 7's
       * control will change it through Better Auth's own update path.
       *
       * `required: true` makes the column `NOT NULL`, which is what lets every derived
       * query downstream write `AT TIME ZONE u.timezone` with no "or else" branch.
       */
      timezone: {
        type: "string",
        required: true,
        defaultValue: TIMEZONE_FALLBACK,
        input: false,
      },

      /**
       * Records that the first-run **Bring your library in** offer has been answered, so
       * that declining it is a decline and not a dismissal — the app must not ask again
       * at the next cold open (issue #70, blocking #75).
       *
       * Same mechanism as `timezone` above and for the same reason: declared here rather
       * than patched into `auth-schema.ts`, which the CLI overwrites whole.
       *
       * `required: false` and no `defaultValue`, unlike `timezone` — the absence of a
       * value *is* the unanswered state, so every existing row is correctly unanswered on
       * migration rather than being backfilled into an answer nobody gave.
       *
       * Nothing reads or writes this field yet. That is deliberate, matching
       * `library_entry.abandoned_at`'s precedent: it isolates this migration from the
       * screen in #75 that will read and write it, so that screen starts with no schema
       * change on its critical path.
       */
      importOfferAnsweredAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },

  session: {
    /** ~1 year, per #8. */
    expiresIn: 60 * 60 * 24 * 365,
    /**
     * Sliding: a session seen today is extended, at most once a day. Without this the
     * year is a hard year and everyone is signed out on the same anniversary.
     */
    updateAge: 60 * 60 * 24,
    /**
     * **Off, deliberately.** Better Auth will otherwise cache the session in a signed
     * cookie and answer `getSession` from it without touching the database.
     *
     * SPEC.md §6 asks for "real server-side revocation", and a cached session is exactly
     * the thing that is not revoked: deleting the row would leave a cookie that still
     * validates for the length of the cache. One query per request is the price of the
     * sign-out in the acceptance criteria meaning what it says.
     */
    cookieCache: { enabled: false },
  },

  /**
   * SPEC.md §6: *Rate limiting is Better Auth's default with storage in Postgres.*
   *
   * `enabled` is written out because Better Auth's own default is production-only, and a
   * limiter that has never run anywhere but production is a limiter nobody has seen work.
   * `storage: "database"` is what puts it in Postgres rather than in the memory of one
   * serverless instance, where on Vercel it would be reset by the next cold start and
   * shared by nobody.
   *
   * This is the fifth table the CLI generates. The four in the acceptance criteria are
   * the identity ones; `rate_limit` is bookkeeping, and it lives in the same single
   * migration history as the rest for the same reason they do.
   */
  rateLimit: {
    enabled: true,
    storage: "database",
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * The one moment an account's zone is decided. See `lib/timezone.ts` for why it
         * arrives on a cookie and why it is validated rather than trusted.
         *
         * Runs on the request Google redirected back to us with, so `context` is the
         * OAuth callback and its `Cookie` header is the browser's. A sign-up with no
         * usable cookie gets the fallback, which is the same value the column defaults
         * to — this hook never leaves the field unset.
         */
        before: async (user, context) => {
          const cookieHeader =
            context?.headers?.get("cookie") ??
            context?.request?.headers.get("cookie") ??
            null;

          return { data: { ...user, timezone: signupTimezoneFrom(cookieHeader) } };
        },
      },
    },
  },

  /**
   * Last in the array, as Better Auth requires. It is what lets a server action set the
   * session cookie — without it, sign-out from a server action would revoke the row and
   * leave the cookie in place.
   */
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

let instance: ReturnType<typeof betterAuth<typeof authOptions>> | undefined;

/**
 * The Better Auth instance, built once per process on first use.
 *
 * Two callers, and there should never be a third: `lib/session.ts`, which is the only
 * place a session becomes a user id, and `app/api/auth/[...all]/route.ts`, which mounts
 * the HTTP endpoints. `eslint.config.mjs` names both.
 */
export function getAuth() {
  instance ??= betterAuth(authOptions);
  return instance;
}
