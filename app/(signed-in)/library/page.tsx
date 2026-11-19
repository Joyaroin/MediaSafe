import { redirect } from "next/navigation";

import { cachedLibrarySection, cachedLibrarySections, cachedLists } from "@/cache/tags";
import { requireImportOfferAnswered, requireUserId } from "@/lib/session";
import { libraryViewFrom } from "./library-view";
import { librarySectionFrom, sectionSortFrom } from "./library-section";
import { LibrarySurface } from "./library-surface";
import { NavTransition } from "../nav-transition";

/**
 * The library — your library as a place you can look at, rather than a query you can run.
 *
 * The desktop landing screen and the first surface in this application that reads owned rows
 * in bulk. Where a title stands and what is next in it are answered by `db/views.ts` and are
 * not re-derived here or anywhere else. Since #219 the reads are reached through
 * `cache/tags.ts` rather than called directly — and sometimes answered from an earlier run.
 *
 * ── Two screens, one param ───────────────────────────────────────────────────────────
 *
 * Since #552 Library is grouped into sections by state, and `?section=<slug>` is what picks
 * the screen:
 *
 *  - **No section, or an unknown one** → the sections: `cachedLibrarySections` returns all
 *    nine (both kinds), each with its true count and its first `SECTION_ROW_SIZE` entries,
 *    and `LibrarySurface` draws the kind the tab is on. An unknown slug is navigation noise
 *    and falls back to this, as `sortFrom` falls back.
 *  - **A section** → `cachedLibrarySection`: that section's whole grid, in its own order, or
 *    in the `?sort=` a reader chose. `?sort=` means nothing on the sections screen.
 *
 * The slug is **always** parsed with `librarySectionFrom` before either read: `sectionWhere`
 * returns a whole kind for a slug it does not know, rather than failing, so a raw `?section=`
 * must never reach it.
 *
 * ── Two states this page still owns, and two more that live below it ────────────────
 *
 * One redirect runs before the empty branch below: a reader with no library **and** no
 * answer on file for the first-run **Bring your library in** offer is sent to `/welcome`
 * (issue #75) rather than shown the empty state. It is checked only when the library is
 * already empty, so a reader with titles never pays for the offer-answered read.
 *
 *  - **The library is empty** → every section's count is zero. This is reachable *only*
 *    because the reads succeeded and found nothing, and the surface says so in the empty
 *    treatment's own voice.
 *  - **A read failed** → it throws, this component never renders, and `error.tsx` draws the
 *    read-failure treatment in its place.
 *
 * There is no third path here, and specifically there is no `try` here or in `db/access.ts`
 * that could turn the second into the first. `AGENTS.md` opens on why.
 *
 * **A kind with nothing in it and a section with nothing in it both belong to
 * `LibrarySurface`.** Each is a fact about a read that succeeded and found nothing for that
 * kind or slug — neither is a second server read, so neither arrives as a branch on this
 * page.
 *
 * ── Why the surface owns its own `<main>` ────────────────────────────────────────────
 *
 * The two branches (the surface, and the empty library inside it) are mutually exclusive, so
 * there is never a nested `<main>` on screen.
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

  // Noise in `?section=`, `?view=` or `?sort=` falls back rather than throwing: a stale or
  // hand-edited link is ordinary navigation, not corruption in the reads below.
  const { sort: sortParam, view: viewParam, section: sectionParam } = await searchParams;
  const section = librarySectionFrom(viewParam, sectionParam);

  /**
   * Unguarded, deliberately. A failure here throws into `error.tsx`, which is the whole error
   * discipline in one line — and it still does through the cache: `unstable_cache` stores a
   * resolved value and lets a rejection through untouched, so there is no cache state in
   * which a database that is down comes back as a library with nothing in it.
   *
   * Each read is `cache/tags.ts`'s wrapper over `db/access.ts`, keyed by this account (and,
   * for a section, the section and the sort), and every write that can change what these
   * show busts the `library` tag inside its own action.
   */
  const sort = sectionSortFrom(sortParam);
  const grid = section === null ? null : await cachedLibrarySection(userId, section, sort);

  // The counts are what say the library is empty, and the sections screen needs them anyway.
  // A section's grid reads them only when it is empty itself — the one case that can mean the
  // whole library is — so a populated grid costs one read, not ten.
  const sections =
    grid === null || grid.length === 0 ? await cachedLibrarySections(userId) : null;
  const libraryEmpty = sections !== null && sections.every((one) => one.count === 0);

  if (libraryEmpty) {
    /**
     * *A first sign-in lands on Bring your library in, not on the empty library* (issue
     * #75). Checked against real rows rather than the column alone, for one reason:
     * `/import` is its own route, reachable directly by URL, and nothing stops a reader from
     * running a real import there without ever passing through `/welcome` —
     * `answerImportOfferAction` is `/welcome`'s own write. A reader who did that has, in the
     * only sense that matters, already answered the offer; asking
     * `requireImportOfferAnswered()` alone would send them back to `/welcome` forever, in
     * front of a library the reads just proved is not empty.
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
        shown={
          section !== null && grid !== null
            ? { mode: "section", section, entries: grid, sort }
            : { mode: "sections", sections: sections ?? [] }
        }
        libraryEmpty={libraryEmpty}
        lists={lists}
        // A link to a section's grid names its kind, which wins over the remembered tab.
        initialView={section?.kind ?? libraryViewFrom(viewParam)}
      />
    </NavTransition>
  );
}
