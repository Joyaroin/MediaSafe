import { redirect } from "next/navigation";

import { cachedLibraryEntries, cachedLists } from "@/cache/tags";
import { sortFrom } from "@/db/library-sort";
import { requireImportOfferAnswered, requireUserId } from "@/lib/session";
import { libraryViewFrom } from "./library-view";
import { LibrarySurface } from "./library-surface";
import { NavTransition } from "../nav-transition";

/**
 * The library — your library as a place you can look at, rather than a query you can run.
 *
 * The desktop landing screen and the first surface in this application that
 * reads owned rows in bulk. Everything on it comes from one query: `listLibraryEntries`
 * joins the derived-state views, so where a title stands and what is next in it are
 * answered by `db/views.ts` and are not re-derived here or anywhere else. Since #219 that
 * query is reached through `cache/tags.ts` rather than called directly — one query still,
 * and sometimes an earlier answer to it.
 *
 * ── Two states this page still owns, and two more that live below it ────────────────
 *
 * One redirect runs before the empty branch below: a reader with no library **and** no
 * answer on file for the first-run **Bring your library in** offer is sent to `/welcome`
 * (issue #75) rather than shown the empty state. Checked only when `entries` is already
 * empty — see `LibraryPage` below for why a non-empty library skips the offer-answered
 * read entirely, not just the redirect. Past that, there is one branch on this page and
 * it is the important one:
 *
 *  - **`entries` is empty** → the library is genuinely empty. This is reachable *only*
 *    because the query returned zero rows, and it says so on screen in the empty
 *    treatment's own voice. No filter bar and no programme note render here —
 *    reserving space for controls with nothing to act on is forbidden, and a chip that would
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
 * *Sort state lives in the URL.* The chip and the filter-by-typing field are
 * ordinary client state, narrowing what this page already fetched — but the order itself
 * is decided in SQL (`db/access.ts`'s four `ORDER BY`s), so changing it has to re-run this
 * read. `?sort=`, read here and handed to `cachedLibraryEntries`, is what makes a link to
 * a sorted library a link to that order rather than to whatever the default was when it
 * was clicked.
 *
 * Since #219 that re-read may be answered from the cache rather than from Postgres —
 * `sort` is part of the key, so each order is its own entry and every one of them carries
 * the same tag. What has not changed is where the order is decided: still four `ORDER BY`s
 * in SQL, never a client-side re-sort of rows fetched in some other order.
 *
 * ── Why the populated branch owns its own `<main>` ────────────────────────────────────
 *
 * The populated case needs a two-column layout — the bill on the left, the programme note
 * on the right (the Never-Navigate-Away Rule) — so `LibrarySurface` brings that
 * `<main>` with it (through `programme-note-layout.tsx`, shared with the desktop Up next
 * rails since #137) rather than this page wrapping one around it. The two branches are
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

  // `sortFrom` falls back to the default rather than throwing: a stale or hand-edited
  // `?sort=` is ordinary navigation noise, not corruption in the read below.
  const { sort: sortParam, view: viewParam } = await searchParams;
  const sort = sortFrom(sortParam);

  /**
   * Unguarded, deliberately. A failure here throws into `error.tsx`, which is the whole
   * error discipline in one line — and it still does through the cache: `unstable_cache`
   * stores a resolved value and lets a rejection through untouched, so there is no cache
   * state in which a database that is down comes back as a library with nothing in it.
   *
   * Cached since issue #219, which reversed the read-cache clause and proved
   * the machinery here. This is the same query it always was — `cache/tags.ts` wraps
   * `listLibraryEntries`, keyed by this account and this sort, and every write that can
   * change what this grid shows busts the tag inside its own action. What changed for
   * this page is that navigating away and back no longer costs a round trip; what did not
   * change is that the rows are this account's, because the key cannot be built without
   * one.
   */
  const entries = await cachedLibraryEntries(userId, sort);

  if (entries.length === 0) {
    /**
     * *A first sign-in lands on Bring your library in, not on the empty library* (issue
     * #75). Checked here rather than before the query above, and checked against real
     * rows rather than the column alone, for one reason: `/import` is its own route,
     * reachable directly by URL, and nothing stops a reader from running a real import
     * there without ever passing through `/welcome` — `answerImportOfferAction` is
     * `/welcome`'s own write and nothing on `/import`'s path calls it. A reader who did
     * that has, in the only sense that matters, already answered the offer; asking
     * `requireImportOfferAnswered()` alone would send them back to `/welcome` forever,
     * in front of a library `listLibraryEntries` just proved is not empty.
     *
     * Guarding the read this way — rather than always calling both checks — also means a
     * reader with a real library never pays for the additional session read at all: this
     * only runs once `entries` is already known to be empty, which is the one case where
     * the answer can still be no.
     */
    if (!(await requireImportOfferAnswered())) redirect("/welcome");
  }

  /**
   * The lists, for the Lists tab — read even for an empty library, because a reader with
   * no titles can still have lists (a list holds titles, not library entries) and must be
   * able to make their first one (issue #357). Unguarded: a failed read throws into this
   * route's own `error.tsx` rather than rendering a Library with no lists in it.
   */
  const lists = await cachedLists(userId);

  return (
    <NavTransition>
      <LibrarySurface
        entries={entries}
        sort={sort}
        lists={lists}
        initialView={libraryViewFrom(viewParam)}
      />
    </NavTransition>
  );
}
