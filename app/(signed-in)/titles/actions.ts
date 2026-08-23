"use server";

import { invalidateFor, invalidateForOtherAccounts } from "@/cache/tags";
import {
  accountsHoldingTitles,
  addTitleToLibrary,
  addTitleToLibraryWatched,
  libraryEntryIdForTitle,
} from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";
import { titleMirror } from "@/tmdb/catalogue";
import { catalogueKeyFrom, type TitleKind } from "@/tmdb/mirror";

/**
 * The one write on the page for a title you do not own — issue #148's *Add to library*.
 *
 * ── Why this is not `addToLibraryAction` ──────────────────────────────────────────────
 *
 * `app/(signed-in)/search/actions.ts` already adds a title from `(kind, tmdbId)`, and the
 * write underneath is the same write — `addTitleToLibrary`, over the mirror `titleMirror`
 * fetches. What differs is the answer this caller needs. Search's row stays where it is
 * and says *In your library*; this page cannot, because the page itself was the *not in
 * your library* answer. It has to become the owned title's page, and that means the id of
 * the entry that now exists.
 *
 * `addTitleToLibrary` reports whether it added and which **title** it mirrored, never
 * which library entry, for the reason its own docblock gives: `onConflictDoNothing`
 * returns nothing on the conflict. So the entry id is read back afterwards, by the same
 * function the page itself uses to decide whether you own this title at all — one
 * definition of *your entry for this title*, used by the read and by the write's
 * follow-up. (`titleId` arrived with #219 and answers a different question: whose caches
 * this add just invalidated. It is not a route this page can send anybody to.)
 *
 * ── The mirror is fetched, not assumed ────────────────────────────────────────────────
 *
 * Everything this page renders came out of the local mirror, so the `title` row provably
 * exists and an add could in principle skip TMDB entirely. It does not, and the reason is
 * not caution: `addTitleToLibrary`'s contract is *mirroring it on the way in* — one person
 * adding a show refreshes the rows every other account reads — and a second way into a
 * library that skipped that refresh would be a second contract. A title reachable from a
 * list is exactly the title that has been sitting in the mirror unrefreshed since somebody
 * else added it.
 *
 * ── The shape, and the `catch` ────────────────────────────────────────────────────────
 *
 * `Outcome`, not a throw, and `search/actions.ts` carries the full argument: React strips
 * a thrown Server Action's error before it crosses to the browser, so the reader would get
 * a `digest` and Sentry would get nothing worth having. The control that calls this raises
 * the write-failure toast from the reference this returns. That is `AGENTS.md`'s **no
 * `catch` returns `[]`** obeyed rather than dodged: this catch manufactures no
 * successful-looking result, it returns a value whose type says the write was lost.
 */
export type AddToLibraryOutcome =
  | { readonly ok: true; readonly libraryEntryId: string }
  | { readonly ok: false; readonly reference: string | null };

export async function addUnownedTitleToLibraryAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<AddToLibraryOutcome> {
  const userId = await requireUserId();
  let libraryEntryId: string;
  /** The global row the add mirrored — see the second bust below for what it is for. */
  let titleId: string;

  try {
    /**
     * Validated inside the `try`, so a tampered call and a TMDB outage leave by the same
     * door — reported to Sentry, answered with a reference id. A Server Action is a POST
     * endpoint whose arguments are whatever the caller sent, whatever this signature says
     * they are. The page's params are checked by the same function, in
     * `[kind]/[tmdbId]/page.tsx`: this action is reachable without ever loading that page,
     * so neither check stands in for the other.
     */
    const key = catalogueKeyFrom(kind, tmdbId);

    titleId = (await addTitleToLibrary(userId, await titleMirror(key.kind, key.tmdbId)))
      .titleId;

    const found = await libraryEntryIdForTitle(userId, key.kind, key.tmdbId);
    if (found === null) {
      /**
       * Unreachable: the write above either created this account's entry or found one
       * already there, and both leave a row for this read to find. It throws rather than
       * returning a success the caller cannot act on — a page that reported the add
       * landed and then had nowhere to send the reader is the write reading as lost and
       * as landed at once.
       */
      throw new Error(
        `Added ${key.kind} ${key.tmdbId} to the library and then found no entry for it.`,
      );
    }

    libraryEntryId = found;
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "unowned-add" }) };
  }

  /**
   * Past the `catch`, so only a landed add busts anything (issue #219). This action's
   * caller navigates straight to the entry's own detail route, and `/library` is one back
   * press behind it — the route whose read is cached — so the bust is what stops that
   * press finding a grid the add is missing from.
   */
  invalidateFor("addTitleToLibrary", userId);

  /**
   * And every other account holding this title, for `search/actions.ts`'s reason and by
   * the same mechanism: the add upserted the **global** `title` row and its episodes
   * through `mirrorTitle`, so it refreshed what everybody else's library grid prints
   * (ADR-0001). `cache/tags.ts`'s `MIRRORS_SHARED_TITLE_ROWS` is the list of writes that
   * owe this call, and the test holds that list against the code rather than against
   * anybody's memory.
   */
  invalidateForOtherAccounts(
    "addTitleToLibrary",
    await accountsHoldingTitles([titleId]),
    userId,
  );
  return { ok: true, libraryEntryId };
}

/**
 * The same door, with the watch recorded on the way through — issue #222, over
 * `db/access.ts`'s `addTitleToLibraryWatched`.
 *
 * Everything the action above says about itself holds here unchanged: the mirror is
 * fetched rather than assumed, the entry id is read back afterwards by the same function
 * the page uses to decide ownership, and `Outcome` rather than a throw because React
 * strips a thrown Server Action's error before it crosses to the browser. It returns
 * `AddToLibraryOutcome` — the same type — because the caller's question is the same one:
 * **which entry is this reader now looking at**, since the page they are on stops being
 * the right page the moment the write lands.
 *
 * `search/actions.ts`'s own watched add carries why this is a second action rather than a
 * flag on the first, and why a browser-minted `sourceKey` is safe to take at a POST
 * endpoint. Neither argument is repeated here.
 */
export async function addUnownedTitleWatchedToLibraryAction(
  kind: TitleKind,
  tmdbId: number,
  sourceKey: string,
): Promise<AddToLibraryOutcome> {
  const userId = await requireUserId();
  let libraryEntryId: string;
  /** The global row this add mirrored — see the second bust below for what it is for. */
  let titleId: string;

  try {
    const key = catalogueKeyFrom(kind, tmdbId);

    titleId = (
      await addTitleToLibraryWatched(
        userId,
        await titleMirror(key.kind, key.tmdbId),
        sourceKey,
      )
    ).titleId;

    const found = await libraryEntryIdForTitle(userId, key.kind, key.tmdbId);
    if (found === null) {
      // Unreachable for the reason the action above gives, and a throw for the same one.
      throw new Error(
        `Added ${key.kind} ${key.tmdbId} to the library and then found no entry for it.`,
      );
    }

    libraryEntryId = found;
  } catch (error) {
    return {
      ok: false,
      reference: referenceFor(error, { surface: "unowned-add-watched" }),
    };
  }

  /**
   * Both busts, for the reasons the action above gives — and this write moves the entry's
   * state as well as creating it, so the grid it lands on is a different grid.
   */
  invalidateFor("addTitleToLibraryWatched", userId);
  invalidateForOtherAccounts(
    "addTitleToLibraryWatched",
    await accountsHoldingTitles([titleId]),
    userId,
  );
  return { ok: true, libraryEntryId };
}
