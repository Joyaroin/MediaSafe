import { afterEach, describe, expect, it } from "vitest";

import { applyImportChunk, asUserId, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { user } from "@/db/schema";
import { buildChunk } from "@/scripts/db-seed";
import type { NativeImportFile } from "@/import/native-format";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `buildChunk` + `applyImportChunk`, run twice — issue #74's own acceptance criterion:
 * *"Re-running is inert — proven by running it twice and comparing counts."*
 *
 * `applyImportChunk`'s idempotence is already exhaustively asserted in
 * `tests/import-chunk.test.ts` (issue #72); what is specific to this CLI and untested
 * elsewhere is that `buildChunk` — which re-fetches every title's mirror from TMDB on
 * every run — feeds it a chunk that stays idempotent even though the mirror was just
 * fetched again rather than reused. TMDB is stubbed rather than called for real, for the
 * same reason `tmdb/catalogue.ts` itself is not asserted against the network: only the
 * interpretation of a response is this repository's to get right, and that half —
 * `filmMirror` — is `tmdb/mirror.ts`'s own tested territory.
 */

setUpTestDatabase("mediasafe_db_seed_idempotence_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

const originalFetch = globalThis.fetch;
const originalToken = process.env.TMDB_READ_ACCESS_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.TMDB_READ_ACCESS_TOKEN = originalToken;
});

/** A single-film file — no episodes to fetch, so one stubbed response is enough. */
function fileFor(tmdbId: number): NativeImportFile {
  return {
    source: "test-fixture",
    titles: [{ tmdbId, kind: "film", abandoned: false }],
    watches: [],
  };
}

function stubTmdbMovie(tmdbId: number): void {
  process.env.TMDB_READ_ACCESS_TOKEN = "test-token";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/movie/${tmdbId}`)) {
      return new Response(
        JSON.stringify({
          id: tmdbId,
          title: `Film ${tmdbId}`,
          release_date: "1999-10-15",
          poster_path: "/poster.jpg",
          runtime: 139,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;
}

describe("db:seed, run twice", () => {
  it("writes the title once and reports zero on the second run", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      stubTmdbMovie(550);
      const file = fileFor(550);

      const first = await applyImportChunk(userId, await buildChunk(file), tx);
      expect(first).toMatchObject({
        titlesAdded: 1,
        watchesAdded: 0,
        arrivedAbandoned: 0,
      });

      // A fresh chunk, refetched from TMDB exactly as a second `npm run db:seed` would.
      const second = await applyImportChunk(userId, await buildChunk(file), tx);
      // Nothing added the second time, and the same one title re-mirrored — a re-run
      // writes no rows and still refreshes the shared mirror (issue #219).
      expect(second).toMatchObject({
        titlesAdded: 0,
        watchesAdded: 0,
        arrivedAbandoned: 0,
      });
      expect(second.mirroredTitleIds).toEqual(first.mirroredTitleIds);
    }));
});
