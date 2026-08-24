import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import cacheKeyCarriesAccount from "./eslint-rules/cache-key-carries-account.mjs";
import noEmptyCatch from "./eslint-rules/no-empty-catch.mjs";

/**
 * The data-access choke point, made a check rather than a convention (issue #40).
 * `db/access.ts` holds the reasoning; this is the enforcement.
 *
 * **Deny by default.** An earlier version listed `app/`, `lib/` and `components/` as the
 * files it applied to, which left three ways around it: a relative `../db/client`, the
 * root `proxy.ts` — issue #43's route matcher, the very boundary this protects, and
 * called `middleware.ts` until Next 16 renamed the convention — and `scripts/`, where
 * build step 3 puts the import's chunked writes. A boundary sold as a check has to be
 * one, so the rule now covers everything and names its exemptions.
 *
 * The specifier patterns are suffix-matched for the same reason: `@/db/client` and
 * `../db/client` are the same import.
 */
const CHOKE_POINT_MESSAGE =
  "Owned rows are read and written through @/db/access, which takes the user id explicitly. Nothing else opens a connection or writes a query (issue #40).";

/**
 * `db/migrate` is in here with the client and the driver because `runMigrations` opens a
 * pool of its own. It is a smaller door than the other two, but it is the same door.
 *
 * Declared once and shared by the two configs below, so the repo-wide rule and the `lib/`
 * one cannot drift apart — which is the failure that let the first version of this rule
 * be worth less than it looked.
 */
const CONNECTION_PATTERN = {
  group: [
    "**/db/client",
    "**/db/driver",
    "**/db/migrate",
    "drizzle-orm",
    "drizzle-orm/*",
    "@neondatabase/serverless",
  ],
  message: CHOKE_POINT_MESSAGE,
};

/**
 * `asUserId` mints the branded id that every scoped query then trusts. Outside the
 * session boundary it is a way to conjure an identity from a query string —
 * `asUserId(searchParams.get("u"))` — which is the whole isolation model handed to the
 * caller. `UserId` the type stays importable everywhere; only the mint is restricted.
 */
const USER_ID_MINT_PATTERN = {
  group: ["**/db/access"],
  importNames: ["asUserId"],
  message:
    "Only lib/session.ts mints a user id, from a session Better Auth resolved — and " +
    "db/access.ts's own resolveSeedUserId, from a user row it looked up itself for " +
    "npm run db:seed (issue #74). Take the UserId as an argument (issue #40).",
};

/**
 * The session boundary, held to the same standard as the data boundary.
 *
 * `lib/session.ts` claims to be the only place that calls Better Auth's
 * `auth.api.getSession()`. That claim was a comment while the one next to it was a lint
 * rule — so here it is as a rule too.
 *
 * Issue #40 left this scoped to all of `lib/` and asked #42 to narrow it once the files
 * existed and it could see which of them needed what. They exist now, and they are:
 *
 *  - **`lib/auth.ts`** holds the Better Auth instance. It needs `better-auth` itself, and
 *    it needs the pool — Better Auth queries its own four tables. It is the one module
 *    outside `db/` allowed the connection, and it carries an inline disable and its own
 *    paragraph explaining why.
 *  - **`lib/session.ts`** needs `@/lib/auth`, and must not have the connection: resolving
 *    who is asking is not a licence to query.
 *  - **`lib/auth-client.ts`** needs `better-auth/react`, and nothing else.
 *  - **`lib/session-cookie.ts`** needs `better-auth/cookies`, added by #43. It reads one
 *    header for `proxy.ts` and resolves nothing, which is why it is here rather than at
 *    the repository root with a disable comment on it: the root gate is the last file
 *    that should be holding an exemption to the session boundary.
 *
 * So the exemption below is the *specifier* one — `better-auth` may be imported inside
 * `lib/` — and the connection rule still applies to all three. `lib/auth.ts` is the only
 * file that steps outside it, on one line, in writing.
 *
 * The `lib/auth` specifier stays restricted everywhere, inside `lib/` too — `lib/session.ts`
 * disables it on the import, so the one legitimate reach for the instance is a line
 * somebody chose to write rather than a door standing open.
 */
const SESSION_BOUNDARY_MESSAGE =
  "A session becomes a user id in lib/session.ts and nowhere else. Take the user id as an argument (issue #40).";

/**
 * Better Auth itself. Restricted outside `lib/`, where the instance and the browser
 * client both live, so that no page constructs a second one or resolves its own session.
 */
const BETTER_AUTH_PATTERN = {
  group: ["better-auth", "better-auth/*"],
  message: SESSION_BOUNDARY_MESSAGE,
};

/**
 * The instance itself, restricted **everywhere** — inside `lib/` too. Three files reach
 * for it and each says why on the line: `lib/session.ts` to resolve a session,
 * `app/api/auth/[...all]/route.ts` to mount the endpoints, and `auth.config.ts` to hand
 * the options to the schema generator. A fourth needs a reason good enough to write down.
 */
const AUTH_INSTANCE_PATTERN = {
  group: ["**/lib/auth"],
  message: SESSION_BOUNDARY_MESSAGE,
};

/**
 * The read cache, held to the standard the two boundaries above are held to (issue #219).
 *
 * `cache/` owns the whole tag vocabulary — every key, every tag, every bust. Two files
 * since issue #225, split for the reason `borrowed-facts.ts` gives at its top: `tags.ts`
 * is reachable from client modules and TMDB's module is `server-only`. The restriction is
 * on the **directory**, so the split changed nothing about it.
 *
 * The two properties that keep *two reads of the same fact cannot disagree* true are
 * properties **of that directory**: keys carry an account because the only things that
 * build one take a `UserId`, and writes bust their tags because the map they bust from is
 * there. A page that reached for `unstable_cache` itself would be outside both, so it may
 * not reach for it at all.
 *
 * `next/cache` is the whole surface, not `unstable_cache` alone: `revalidatePath`,
 * `revalidateTag` and `updateTag` are how the busting half gets done somewhere else.
 * `cache-key-carries-account.mjs` covers the keying half wherever it is written, including
 * inside `cache/`, where this restriction does not apply.
 */
const READ_CACHE_PATTERN = {
  group: ["next/cache"],
  message:
    "Reads are cached and tags are busted in cache/ — tags.ts for facts about an account, borrowed-facts.ts for facts about a title — which owns the vocabulary and takes the user id explicitly. Call invalidateFor() from your action (issue #219).",
};

const dataAccessChokePoint = {
  name: "mediasafe/data-access-choke-point",
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          CONNECTION_PATTERN,
          USER_ID_MINT_PATTERN,
          BETTER_AUTH_PATTERN,
          AUTH_INSTANCE_PATTERN,
          READ_CACHE_PATTERN,
        ],
      },
    ],
  },
};

/**
 * The inside of the read cache's choke point, and the only directory exempt from it. It is
 * still held to every other pattern above — owning the cache is not a licence to open a
 * connection or resolve a session.
 */
const readCacheExemption = {
  name: "mediasafe/read-cache",
  files: ["cache/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          CONNECTION_PATTERN,
          USER_ID_MINT_PATTERN,
          BETTER_AUTH_PATTERN,
          AUTH_INSTANCE_PATTERN,
        ],
      },
    ],
  },
};

/**
 * The session boundary itself may reach for Better Auth, and is the one place that mints
 * a user id. It is still held to the connection rule — resolving who is asking is not a
 * licence to query — and to the instance rule, so that reaching for `lib/auth` stays a
 * line somebody wrote a reason beside.
 */
const sessionBoundaryExemption = {
  name: "mediasafe/session-boundary",
  files: ["lib/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      { patterns: [CONNECTION_PATTERN, AUTH_INSTANCE_PATTERN, READ_CACHE_PATTERN] },
    ],
  },
};

/**
 * `db/` is the inside of the choke point. `tests/` is exempt because the harness has to
 * open its own pool against its own scratch database — the one thing the application
 * must never do — and `drizzle.config.ts` is drizzle-kit's own input.
 *
 * `auth-schema.ts` is exempt on the same grounds as `db/`: it *is* schema, and it is
 * re-exported by `db/schema.ts` as though it sat there. It is not written by hand at all
 * — the Better Auth CLI overwrites it whole — so a rule against its `drizzle-orm/pg-core`
 * import could not be obeyed by anybody and would only be a lint failure that returns
 * every time the schema is regenerated.
 */
const chokePointExemptions = {
  name: "mediasafe/data-access-choke-point-exemptions",
  files: ["db/**", "tests/**", "drizzle.config.ts", "auth-schema.ts"],
  rules: {
    "no-restricted-imports": "off",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  dataAccessChokePoint,
  sessionBoundaryExemption,
  readCacheExemption,
  chokePointExemptions,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The design tool's own canvas runtime (issue #255). `mediasafe-mobile.html` and the
    // exploration board beside it each load `./support.js`, vendored so the boards
    // actually open from the repository rather than being cited against a path that holds
    // nothing. It is third-party reference material, not application code: it renders with
    // `ReactDOM.render` and assigns to `module`, so linting it means CI failing on
    // somebody else's file. Nothing imports it.
    //
    // **The one file, not the directory.** `docs/design/prototypes/**` was the first
    // spelling and it ignores too much: the prototypes are `.html` and `.js` today, and a
    // `.tsx` one dropped in there later would go unlinted with nothing to say it had.
    "docs/design/prototypes/support.js",
  ]),
  {
    // SPEC.md §3.2 — no `catch` returns `[]` — and SPEC.md §3.1's amendment — no cache
    // key without an account — both enforced rather than remembered. `npm run lint` is
    // one of the three things CI runs (SPEC.md §6), which is why the two constraints live
    // here and not in a test: a test would never see a pull request.
    plugins: {
      mediasafe: {
        rules: {
          "no-empty-catch": noEmptyCatch,
          "cache-key-carries-account": cacheKeyCarriesAccount,
        },
      },
    },
    rules: {
      "mediasafe/no-empty-catch": "error",
      "mediasafe/cache-key-carries-account": "error",
    },
  },
]);

export default eslintConfig;
