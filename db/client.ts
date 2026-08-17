import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "./driver";
import * as schema from "./schema";

/**
 * The application's connection pool and Drizzle client — one per process.
 *
 * Built on first use rather than on import. Importing this module must not need a
 * database: `next build` evaluates every route's module graph while collecting page
 * data, and a pool constructed at import time turns "no DATABASE_URL" into a build
 * failure rather than a request failure. CI runs `build` as a signal check, and it
 * should not have to invent a fake connection string to do it.
 *
 * The failure is still loud, just moved to the first query — where issue #41's
 * `error.tsx` boundary is what catches it.
 *
 * This module is deliberately thin. Build step 1's data-access choke point, the module
 * that takes a session's user id and is the only thing that reads rows, is issue #40 and
 * is built on top of this rather than instead of it.
 */

function createClient() {
  const pool = createPool(requireDatabaseUrl());
  return { pool, db: drizzle(pool, { schema }) };
}

type Client = ReturnType<typeof createClient>;

// Next.js reloads server modules on every edit in development. Without this the pool is
// recreated per reload and connections leak until Postgres refuses new ones.
const globalForDb = globalThis as unknown as { mediasafeDbClient?: Client };

function getClient(): Client {
  const existing = globalForDb.mediasafeDbClient;
  if (existing) return existing;

  const client = createClient();
  globalForDb.mediasafeDbClient = client;
  return client;
}

export function getDb(): Client["db"] {
  return getClient().db;
}

export function getPool(): Client["pool"] {
  return getClient().pool;
}
