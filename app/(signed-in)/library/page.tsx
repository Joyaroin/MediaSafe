import { listLibraryEntries } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { EmptyLibrary } from "./empty-library";
import { LibraryGrid } from "./library-grid";
import { LibraryHeading, LIBRARY_HEADING_ID } from "./library-heading";

/**
 * The library — your library as a place you can look at, rather than a query you can run.
 *
 * The desktop landing screen (`SPEC.md` §7) and the first surface in this application that
 * reads owned rows in bulk. Everything on it comes from one query: `listLibraryEntries`
 * joins the two derived-state views, so where a title stands and what is next in it are
 * answered by `db/views.ts` and are not re-derived here or anywhere else.
 *
 * ── Two states, and the reason the whole ticket is shaped around them ────────────────
 *
 * There is one branch on this page and it is the important one:
 *
 *  - **`entries` is empty** → the library is genuinely empty. This is reachable *only*
 *    because the query returned zero rows, and it says so on screen in the empty
 *    treatment's own voice.
 *  - **The read failed** → the query throws, this component never renders, and
 *    `error.tsx` draws the read-failure treatment in its place.
 *
 * There is no third path, and specifically there is no `try` here or in `db/access.ts`
 * that could turn the second into the first. `AGENTS.md` opens on why: `tvtracker`
 * collapsed the two, and a database that was down looked exactly like a library with
 * nothing in it for the whole life of that app.
 *
 * **Zero matches is a third state and is not in this ticket.** It arrives with the filter
 * that can produce it (#57), because until something can narrow the library there is no
 * way to match nothing.
 */

/**
 * Never prerendered, for the reason `/search` and `/settings` carry the same line: reading
 * the session reads cookies, which makes the route dynamic only *after* the attempt — and
 * without this, `next build` starts a prerender, calls `requireUserId()`, and resolves the
 * pool against whatever `DATABASE_URL` the build environment has.
 */
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  /**
   * The gate with teeth. `proxy.ts` turned away a reader carrying no cookie at all; this
   * queries the session table, and it is also where the user id comes from — the one place
   * "who is this" is decided (`lib/session.ts`), and the first argument every function in
   * `db/access.ts` takes.
   */
  const userId = await requireUserId();

  /**
   * Unguarded, deliberately. A failure here throws into `error.tsx`, which is the whole
   * error discipline in one line.
   */
  const entries = await listLibraryEntries(userId);

  return (
    <main className="flex w-full flex-1 flex-col">
      <LibraryHeading />

      {entries.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <LibraryGrid entries={entries} labelledBy={LIBRARY_HEADING_ID} />
      )}
    </main>
  );
}
