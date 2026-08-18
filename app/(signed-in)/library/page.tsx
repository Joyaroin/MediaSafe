import { redirect } from "next/navigation";

import { listLibraryEntries } from "@/db/access";
import { sortFrom } from "@/db/library-sort";
import { requireImportOfferAnswered, requireUserId } from "@/lib/session";
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
 * ── Two states this page still owns, and two more that live below it ────────────────
 *
 * One redirect runs before either: a reader who has not answered the first-run **Bring
 * your library in** offer is sent to `/welcome` before this page reads anything (issue
 * #75). Past that, there is one branch on this page and it is the important one:
 *
 *  - **`entries` is empty** → the library is genuinely empty. This is reachable *only*
 *    because the query returned zero rows, and it says so on screen in the empty
 *    treatment's own voice. No filter bar and no programme note render here — `SPEC.md`
 *    §9 forbids reserving space for controls with nothing to act on, and a chip that would
 *    read "0" for every state, or a pane with nothing to select into, are exactly that.
 *  - **The read failed** → the query throws, this component never renders, and
 *    `error.tsx` draws the read-failure treatment in its place.
 *
 * There is no third path here, and specifically there is no `try` here or in
 * `db/access.ts` that could turn the second into the first. `AGENTS.md` opens on why:
 * `tvtracker` collapsed the two, and a database that was down looked exactly like a
 * library with nothing in it for the whole life of that app.
 *
 * **Zero matches and which entry is selected both belong to `LibrarySurface`.** Narrowing
 * a non-empty library down to nothing is a client-side fact about the chip and the filter
 * field, and which tile is open in the programme note is a third, independent piece of
 * client state (#58) — neither is a second server read, so neither can arrive as a branch
 * on this page.
 *
 * ── Sort is the one control that is a real navigation ────────────────────────────────
 *
 * `SPEC.md` §7: *sort state lives in the URL.* The chip and the filter-by-typing field are
 * ordinary client state, narrowing what this page already fetched — but the order itself
 * is decided in SQL (`db/access.ts`'s four `ORDER BY`s), so changing it has to re-run this
 * query. `?sort=`, read here and handed to `listLibraryEntries`, is what makes a link to a
 * sorted library a link to that order rather than to whatever the default was when it was
 * clicked.
 *
 * ── Why `LibrarySurface` owns its own `<main>` ────────────────────────────────────────
 *
 * The populated case needs a two-column layout — the bill on the left, the programme note
 * on the right (`DESIGN.md`'s Never-Navigate-Away Rule) — so `LibrarySurface` renders that
 * `<main>` itself rather than this page wrapping one around it. The two branches are
 * mutually exclusive, so there is never a nested `<main>` on screen.
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

  /**
   * *A first sign-in lands on Bring your library in, not on the empty library* (issue
   * #75). This is the one place that redirect fires: `/` always lands here, so this is
   * the desktop landing screen `SPEC.md` §7 means, and every reader who has not yet
   * answered the offer is turned back to it before this page reads a single row.
   */
  if (!(await requireImportOfferAnswered())) redirect("/welcome");

  // `sortFrom` falls back to the default rather than throwing: a stale or hand-edited
  // `?sort=` is ordinary navigation noise, not corruption in the read below.
  const { sort: sortParam } = await searchParams;
  const sort = sortFrom(sortParam);

  /**
   * Unguarded, deliberately. A failure here throws into `error.tsx`, which is the whole
   * error discipline in one line.
   */
  const entries = await listLibraryEntries(userId, sort);

  if (entries.length === 0) {
    return (
      <main className="flex w-full flex-1 flex-col">
        <LibraryHeading />
        <EmptyLibrary />
      </main>
    );
  }

  return <LibrarySurface entries={entries} sort={sort} />;
}
