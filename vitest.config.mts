import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Tests run against the real local Docker Postgres — `docker compose up -d` first, or
 * `npm run db:up`. There is no in-memory substitute and no mocked constraint: the
 * properties worth testing here live in Postgres, and a mock of a unique constraint
 * tests the mock (SPEC.md §6).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Scratch databases are created and dropped by name, so two files running at once
    // would collide on the server rather than isolating from each other.
    fileParallelism: false,
    setupFiles: ["dotenv/config"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
});
