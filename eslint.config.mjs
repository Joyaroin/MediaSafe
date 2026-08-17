import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import noEmptyCatch from "./eslint-rules/no-empty-catch.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
