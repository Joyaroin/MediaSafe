import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The data-access choke point, made a check rather than a convention (issue #40).
 *
 * There is no row-level security — Neon's connection owns the tables and would bypass
 * any policy (SPEC.md §6) — so one filtered `user_id` column in `db/access.ts` is the
 * whole isolation mechanism. It only holds while nothing else reaches around it, and
 * "nothing else reaches around it" is not something a reviewer can be relied on to
 * notice in a diff that is mostly JSX.
 *
 * `db/` is exempt because it is the inside of the choke point. `tests/` is exempt
 * because the harness has to construct its own pool against its own scratch database,
 * which is the one thing the application must never do.
 */
const dataAccessChokePoint = {
  name: "mediasafe/data-access-choke-point",
  files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/db/client",
            message:
              "Owned rows are read and written through @/db/access, which takes the user id explicitly (issue #40).",
          },
          {
            name: "@/db/driver",
            message:
              "Nothing outside db/ opens a connection. Use @/db/access (issue #40).",
          },
        ],
        patterns: [
          {
            group: ["drizzle-orm", "drizzle-orm/*", "@neondatabase/serverless"],
            message:
              "Queries live in @/db/access, not at the call site — that module is the only place a user_id filter can be forgotten (issue #40).",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  dataAccessChokePoint,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
