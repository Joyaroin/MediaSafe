/**
 * What a live-only section says when its read failed — `LiveFactSection`'s inline
 * treatment, the *one region failed to load* row of `AGENTS.md`'s blast-radius table at
 * section scope.
 *
 * A constant in a module with no imports, rather than prose in the JSX, so that a test can
 * reach it: `live-title-facts.tsx`'s import graph reaches `tmdb/catalogue.ts`, which is
 * `import "server-only"` and throws under Vitest. `tests/live-fact-failure.test.ts` holds
 * the sentence to the rules below and checks the component still renders it.
 *
 * A plain sentence: no status, no exception message, no error code. The one technical
 * string on the surface is the reference id, and it is drawn beside this by
 * `ReferenceLine` rather than interpolated into it — which is also why this can be a
 * constant at all. It does not name TMDB: *TMDB has nothing for this* over a request that
 * timed out would claim the catalogue is empty when the read simply failed.
 *
 * The second half is the part that earns its place: it tells the reader the **blast
 * radius**, so that a page with one dead section is not read as a page that half-arrived.
 */
export const LIVE_FACT_FAILURE =
  "This did not load. Nothing else on this page did either — the rest of it is not affected.";
