import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import noEmptyCatch from "./eslint-rules/no-empty-catch.mjs";

/**
 * The data-access choke point, made a check rather than a convention (issue #40).
 * `db/access.ts` holds the reasoning; this is the enforcement.
 *
 * **Deny by default.** An earlier version listed `app/`, `lib/` and `components/` as the
 * files it applied to, which left three ways around it: a relative `../db/client`, the
 * root `middleware.ts` — issue #43's route matcher, the very boundary this protects —
 * and `scripts/`, where build step 3 puts the import's chunked writes. A boundary sold
 * as a check has to be one, so the rule now covers everything and names its exemptions.
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
    "Only lib/session.ts mints a user id, from a session Better Auth resolved. Take the UserId as an argument (issue #40).",
};

/**
 * The session boundary, held to the same standard as the data boundary.
 *
 * `lib/session.ts` claims to be the only place that will ever call Better Auth's
 * `auth.api.getSession()`. That claim was a comment while the one next to it was a lint
 * rule — so here it is as a rule too. Better Auth is not installed yet (issue #42);
 * `no-restricted-imports` matches specifier strings, so this fires the day it is.
 *
 * Scoped to `lib/` rather than to `lib/session.ts` alone, because #42 also needs a
 * `lib/auth.ts` holding the Better Auth instance. #42 should narrow it further once
 * those two files exist and it can see which of them needs what.
 */
const SESSION_BOUNDARY_MESSAGE =
  "A session becomes a user id in lib/session.ts and nowhere else. Take the user id as an argument (issue #40).";

const dataAccessChokePoint = {
  name: "mediasafe/data-access-choke-point",
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          CONNECTION_PATTERN,
          USER_ID_MINT_PATTERN,
          {
            group: ["better-auth", "better-auth/*", "**/lib/auth"],
            message: SESSION_BOUNDARY_MESSAGE,
          },
        ],
      },
    ],
  },
};

/**
 * The session boundary itself may reach for Better Auth, and is the one place that mints
 * a user id. It is still held to the connection rule: resolving who is asking is not a
 * licence to query.
 */
const sessionBoundaryExemption = {
  name: "mediasafe/session-boundary",
  files: ["lib/**"],
  rules: {
    "no-restricted-imports": ["error", { patterns: [CONNECTION_PATTERN] }],
  },
};

/**
 * `db/` is the inside of the choke point. `tests/` is exempt because the harness has to
 * open its own pool against its own scratch database — the one thing the application
 * must never do — and `drizzle.config.ts` is drizzle-kit's own input.
 */
const chokePointExemptions = {
  name: "mediasafe/data-access-choke-point-exemptions",
  files: ["db/**", "tests/**", "drizzle.config.ts"],
  rules: {
    "no-restricted-imports": "off",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  dataAccessChokePoint,
  sessionBoundaryExemption,
  chokePointExemptions,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // SPEC.md §3.2 — no `catch` returns `[]` — enforced rather than remembered.
    // `npm run lint` is one of the three things CI runs (SPEC.md §6), which is why the
    // constraint lives here and not in a test: a test would never see a pull request.
    plugins: { mediasafe: { rules: { "no-empty-catch": noEmptyCatch } } },
    rules: { "mediasafe/no-empty-catch": "error" },
  },
]);

export default eslintConfig;
