import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { LIBRARY_STATES, type LibraryState } from "@/db/access";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Issue #615 — the states `library_entry_state` can produce are exactly the members of
 * `LibraryState`, in both directions.
 *
 * ── Why it matters ───────────────────────────────────────────────────────────────────
 *
 * Library's section reads pick entries by state (#552), so an entry in a state the code does
 * not know matches no section and vanishes from Library with no error. The view's `case`
 * is fixed, so an unknown state can only appear if someone changes the view or the type
 * without the other. This is the test that notices.
 *
 * ── Where the view's states come from ────────────────────────────────────────────────
 *
 * From `pg_get_viewdef` on the **migrated scratch database**, not from `db/views.ts`'s
 * source. The migrations are what a deploy runs, so this reads the definition production
 * will have; parsing the TypeScript would instead test the file that *describes* the view,
 * and a view edited in `db/views.ts` without a migration would pass it while production
 * kept the old one.
 *
 * Postgres prints the view as one `CASE WHEN … THEN 'x'::text … ELSE 'y'::text END AS
 * state`, and the `case` is the only thing in this view that has `THEN` or `ELSE` (the
 * rest is `exists` subqueries), so every literal after one of those two words is a state
 * the view can return. The first test proves that reading found something real, so a
 * format change in Postgres fails loudly rather than matching an empty set on both sides.
 *
 * `LibraryState` is derived from `LIBRARY_STATES` in `db/access.ts`, which is also what
 * `stateFrom` matches against and what `stateLabel`'s `Record<LibraryState, …>` tables are
 * keyed by (the compiler checks those are exhaustive). No other list of states exists:
 * the section slugs in `db/library-section.ts` name sections, not states.
 */
setUpTestDatabase("mediasafe_library_state_view_test");

async function statesTheViewCanReturn(): Promise<readonly string[]> {
  return inTransaction(async (tx) => {
    const result = await tx.execute<{ definition: string }>(
      sql`select pg_get_viewdef('library_entry_state'::regclass) as definition`,
    );
    const definition = result.rows[0]?.definition;
    if (definition === undefined) {
      throw new Error("pg_get_viewdef returned no definition for library_entry_state");
    }
    const found = [...definition.matchAll(/\b(?:then|else)\s+'([^']*)'/gi)].map(
      (match) => match[1],
    );
    return [...new Set(found)].sort();
  });
}

describe("the states library_entry_state can produce", () => {
  it("are read from the view's real definition, not an empty set", async () => {
    const states = await statesTheViewCanReturn();
    // The reading itself: a `case` with these branches, and at least the two ends we know.
    expect(states.length).toBeGreaterThan(1);
    expect(states).toContain("abandoned");
    expect(states).toContain("watching");
  });

  it("are exactly the members of LibraryState", async () => {
    const fromView = await statesTheViewCanReturn();
    const fromType: readonly LibraryState[] = [...LIBRARY_STATES].sort();

    const missingFromType = fromView.filter(
      (state) => !fromType.some((known) => known === state),
    );
    const missingFromView = fromType.filter((known) => !fromView.includes(known));

    // Two assertions so a failure names which side is short: a state the view returns that
    // the type lacks vanishes from Library; a state the type has that the view never
    // returns is dead code in every section read.
    expect(missingFromType, "returned by the view but not in LibraryState").toEqual([]);
    expect(missingFromView, "in LibraryState but never returned by the view").toEqual([]);
    expect(fromView).toEqual(fromType);
  });
});
