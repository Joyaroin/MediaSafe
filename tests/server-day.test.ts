import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { serverDay } from "@/cache/tags";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * **`cache/tags.ts`'s `serverDay` is a claim about Postgres, so it is checked against
 * Postgres.**
 *
 * Issue #226 puts the day in the cache key of every read that consults `current_date` —
 * the library grid, the three up-next reads and title detail — because the clock moves
 * those answers with no write to hang a bust on (`serverDay`'s own docblock argues it, and
 * `docs/adr/0003-the-clock-is-an-input-not-a-window.md` records the decision).
 *
 * That only works if the day in the key is **the same day the query used**. If Node and
 * Postgres disagree about which date it is, the key turns over at a boundary the answer
 * does not, and the result is worse than no key part at all: a cache that refreshes at the
 * wrong midnight, still serving yesterday's rails through the hours that matter and paying
 * for a fresh read in the hours that do not.
 *
 * `serverDay` reads UTC on the grounds that `db/views.ts` reads the server's own
 * `current_date` — a deliberate exception to `SPEC.md` §5, argued there. **That is a claim
 * about how the database is configured**, not about this function, and a claim about
 * configuration is exactly the kind that goes quietly false: someone sets `TimeZone` on the
 * Neon project, or the container's image changes its default, and nothing anywhere fails.
 * This is what fails instead.
 *
 * ── Why the real database, when `tests/cache-tags.test.ts` fakes Next.js ─────────────
 *
 * Because the question is different. That file asks whether the module hands Next.js a key
 * that tells two accounts apart, which is answerable from the key derivation alone. This
 * asks what `current_date` actually is on the database this application talks to, and
 * there is no way to ask that but to ask it.
 */

const database = setUpTestDatabase("mediasafe_server_day_test");

describe("serverDay is the database's own day", () => {
  it("is on a real database, not a mock that would agree with anything", async () => {
    expect(database.connectionString()).toContain("mediasafe_server_day_test");
  });

  /**
   * Asked in one statement so there is no window between the two reads for a real midnight
   * to fall into — and even then, a run that straddles one would fail on a boundary rather
   * than on a bug. The retry that would paper over that is deliberately not here: this test
   * runs in seconds, once, and a spurious failure a few milliseconds either side of
   * midnight is a cheaper thing to live with than a loop that could swallow a genuine
   * disagreement.
   */
  it("matches current_date, which is what the derived views compare air dates against", async () => {
    const day = await inTransaction(async (tx) => {
      const result = await tx.execute<{ today: string }>(
        sql`select to_char(current_date, 'YYYY-MM-DD') as today`,
      );
      return result.rows[0].today;
    });

    expect(serverDay()).toBe(day);
  });

  /**
   * The released test itself, not merely the date beside it. `db/views.ts` writes
   * `air_date <= current_date`, and this is the same comparison run against a date built
   * from `serverDay` — so a zone disagreement fails here as *the episode this key says is
   * released is not the episode the query says is released*, which is the sentence the
   * failure is actually about.
   */
  it("agrees with the database about which air dates have happened", async () => {
    const today = serverDay();

    const { released, unreleased } = await inTransaction(async (tx) => {
      const result = await tx.execute<{ released: boolean; unreleased: boolean }>(
        sql`select
              (${today}::date <= current_date) as released,
              (${today}::date + 1 <= current_date) as unreleased`,
      );
      return result.rows[0];
    });

    expect(released).toBe(true);
    expect(unreleased).toBe(false);
  });
});
