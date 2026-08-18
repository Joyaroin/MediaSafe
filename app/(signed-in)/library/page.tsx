import { listLibraryEntries } from "@/db/access";
import { sortFrom } from "@/db/library-sort";
import { requireUserId } from "@/lib/session";
import { EmptyLibrary } from "./empty-library";
import { LibraryHeading } from "./library-heading";
import { LibrarySurface } from "./library-surface";

/**
 * The library — your library as a place you can look at, rather than a query you can run.
 *
 * The desktop landing screen (`SPEC.md` §7) and the first surface in this application that
 * reads owned rows in bulk. Everything on it comes from one query: `listLibraryEntries`
 * joins the derived-state views, so where a title stands and what is next in it are
 * answered by `db/views.ts` and are not re-derived here or anywhere else.
 *
 * ── Two states this page still owns, and a third that lives below it ────────────────
 *
 * There is one branch on this page and it is the important one:
 *
 *  - **`entries` is empty** → the library is genuinely empty. This is reachable *only*
 *    because the query returned zero rows, and it says so on screen in the empty
 *    treatment's own voice. No filter bar is rendered here — `SPEC.md` §9 forbids
 *    reserving space for controls with nothing to act on, and a chip that would read "0"
 *    for every state is exactly that.
 *  - **The read failed** → the query throws, this component never renders, and
 *    `error.tsx` draws the read-failure treatment in its place.
 *
 * There is no third path here, and specifically there is no `try` here or in
 * `db/access.ts` that could turn the second into the first. `AGENTS.md` opens on why:
 * `tvtracker` collapsed the two, and a database that was down looked exactly like a
 * library with nothing in it for the whole life of that app.
 *
 * **Zero matches is a third state, and it belongs to `LibrarySurface`.** Narrowing a
 * non-empty library down to nothing is a client-side fact about the chip and the filter
 * field, not a second server read, so it cannot arrive as a branch on this page.
 *
 * ── Sort is the one control that is a real navigation ────────────────────────────────
 *
 * `SPEC.md` §7: *sort state lives in the URL.* The chip and the filter-by-typing field are
 * ordinary client state, narrowing what this page already fetched — but the order itself
 * is decided in SQL (`db/access.ts`'s four `ORDER BY`s), so changing it has to re-run this
 * query. `?sort=`, read here and handed to `listLibraryEntries`, is what makes a link to a
 * sorted library a link to that order rather than to whatever the default was when it was
 * clicked.
 */

/**
 * Never prerendered, for the reason `/search` and `/settings` carry the same line: reading
 * the session reads cookies, which makes the route dynamic only *after* the attempt — and
 * without this, `next build` starts a prerender, calls `requireUserId()`, and resolves the
 * pool against whatever `DATABASE_URL` the build environment has.
 */
export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /**
   * The gate with teeth. `proxy.ts` turned away a reader carrying no cookie at all; this
   * queries the session table, and it is also where the user id comes from — the one place
   * "who is this" is decided (`lib/session.ts`), and the first argument every function in
   * `db/access.ts` takes.
   */
  const userId = await requireUserId();

  // `sortFrom` falls back to the default rather than throwing: a stale or hand-edited
  // `?sort=` is ordinary navigation noise, not corruption in the read below.
  const { sort: sortParam } = await searchParams;
  const sort = sortFrom(sortParam);

  /**
   * Unguarded, deliberately. A failure here throws into `error.tsx`, which is the whole
   * error discipline in one line.
   */
  const entries = await listLibraryEntries(userId, sort);

  return (
    <main className="flex w-full flex-1 flex-col">
      {entries.length === 0 ? (
        <>
          <LibraryHeading />
          <EmptyLibrary />
        </>
      ) : (
        <LibrarySurface entries={entries} sort={sort} />
      )}
    </main>
  );
}
