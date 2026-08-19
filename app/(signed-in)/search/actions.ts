"use server";

import { addTitleToLibrary, libraryCatalogueKeys } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { searchCatalogue, titleMirror } from "@/tmdb/catalogue";
import {
  catalogueKeyFrom,
  catalogueKeyOf,
  type CatalogueResult,
  type TitleKind,
} from "@/tmdb/mirror";
import { requireUserId } from "@/lib/session";

/**
 * The two things the search screen asks the server for.
 *
 * ── Why these return an outcome instead of throwing ──────────────────────────────────
 *
 * `SPEC.md` §3.2 is *empty and failed are structurally separate*, and `AGENTS.md` spells
 * the forbidden shape out: no `catch` returns `[]`. Both are obeyed here, and the second
 * one's own lint message names this escape hatch — *"rethrow, or return a value that says
 * the read failed."* That is what `{ ok: false }` is. Nothing below manufactures an empty
 * list out of a failure; a failed search is a different variant of a different type, and
 * the screen cannot render it as *no results* without a compile error.
 *
 * Throwing was the alternative and it is worse **here specifically**, for a reason that
 * does not generalise: a failure on this screen must be inline within the results region
 * — one region failed to load, which is `SPEC.md` §6's first blast radius — and it must
 * carry a reference id. React strips a thrown Server Action error before it crosses to
 * the browser: the client would get a generic message and a `digest`, and `referenceFor`
 * on the client would report an error that has already lost everything worth reporting.
 * Catching here means Sentry gets the real exception, with the TMDB status in its message,
 * and the reader gets the event id for *that* event.
 *
 * The rest of the application still throws. `app/error.tsx` is the boundary for every read
 * that renders on the server, and nothing here changes that.
 *
 * ── The user id ──────────────────────────────────────────────────────────────────────
 *
 * Both actions resolve it at the boundary, from `lib/session.ts`, and hand it to
 * `db/access.ts` as a first argument — the shape issue #40 built. A Server Action is a
 * POST endpoint that anyone with a session can call with any arguments, so `requireUserId`
 * here is the check, not a formality: `proxy.ts` only proves a cookie was present.
 */

/** A catalogue result, plus the one thing only this account can answer about it. */
export interface MarkedResult extends CatalogueResult {
  /**
   * Already in this account's library, so the screen says so rather than offering to add
   * it twice.
   */
  readonly inLibrary: boolean;
}

export type SearchOutcome =
  | { readonly ok: true; readonly results: readonly MarkedResult[] }
  /** MediaSafe could not reach the catalogue. **Not** the same as it having nothing. */
  | { readonly ok: false; readonly reference: string | null };

export type AddOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

/**
 * Search the catalogue by name, and mark the results this account already holds.
 *
 * *Search*, not *filter*: CONTEXT.md reserves the first for the catalogue and the second
 * for your own library, and this one has never seen your library except to answer *do you
 * have this*.
 */
export async function searchCatalogueAction(query: string): Promise<SearchOutcome> {
  const userId = await requireUserId();

  try {
    const trimmed = query.trim();
    // A blank query is not a search. The screen does not send one — its *not yet typed*
    // state is what a blank field renders — and if something else ever does, the honest
    // answer is that nothing was asked, not that nothing matched.
    if (!trimmed) return { ok: true, results: [] };

    const results = await searchCatalogue(trimmed);
    const held = await libraryCatalogueKeys(userId, results);

    return {
      ok: true,
      results: results.map((result) => ({
        ...result,
        inLibrary: held.has(catalogueKeyOf(result)),
      })),
    };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "search" }) };
  }
}

/**
 * Add one catalogue result to this account's library, mirroring it on the way in.
 *
 * One action, from the result, with no intermediate form — so everything the mirror needs
 * is fetched here rather than asked of the reader. For a show that is the series and every
 * season, because ADR-0001 mirrors episode **names** and CONTEXT.md makes them
 * load-bearing.
 *
 * **Already in the library is a success.** The screen offers no second add, so reaching
 * this twice is a retry or a second tab, and telling the reader their library is wrong
 * because it already contains what they asked for would be a lie about a write that landed.
 */
export async function addToLibraryAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<AddOutcome> {
  const userId = await requireUserId();

  try {
    /**
     * Validated inside the `try`, so a tampered call and a TMDB outage take the same path
     * out: reported to Sentry, and answered with a reference id. A Server Action's
     * arguments are whatever the caller sent, and `kind` reaches `UNIQUE (kind, tmdb_id)`
     * and a `CHECK` constraint.
     *
     * The predicate itself is `tmdb/mirror.ts`'s, shared with the other two doors a
     * catalogue key arrives through (issue #148's add, and its route's own segments) —
     * this check was the first of the three and was copied to make the others.
     */
    const key = catalogueKeyFrom(kind, tmdbId);

    await addTitleToLibrary(userId, await titleMirror(key.kind, key.tmdbId));
    return { ok: true };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "search-add" }) };
  }
}
