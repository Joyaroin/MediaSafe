"use server";

import { addTitleToLibrary, libraryEntryIdForTitle } from "@/db/access";
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
 * `addTitleToLibrary` reports `{ added }` and not which row, for the reason its own
 * docblock gives: `onConflictDoNothing` returns nothing on the conflict. So the id is read
 * back afterwards, by the same function the page itself uses to decide whether you own
 * this title at all — one definition of *your entry for this title*, used by the read and
 * by the write's follow-up.
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

    await addTitleToLibrary(userId, await titleMirror(key.kind, key.tmdbId));

    const libraryEntryId = await libraryEntryIdForTitle(userId, key.kind, key.tmdbId);
    if (libraryEntryId === null) {
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

    return { ok: true, libraryEntryId };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "unowned-add" }) };
  }
}
