"use server";

import { invalidateFor } from "@/cache/tags";
import { rateTitle } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The press that writes a rating — issue #113, on top of `db/access.ts`'s `rateTitle`.
 * A thin Server Action wrapper for the reason `watch-action.ts` already gives: a Server
 * Action is a POST endpoint anyone can call with any arguments, so `requireUserId` here
 * is the check, and catching here — rather than letting this throw — is what lets
 * `errors/write-failure.ts`'s toast report a reference id instead of losing the exception
 * the moment React strips it on the way to the browser.
 *
 * ── Why this is its own file and not a fifth export of `title-detail-actions.ts` ──────
 *
 * That module imports `tmdb/catalogue.ts`, which is `server-only` — a sentinel that
 * throws on import outside Next's own build and takes every component in its import graph
 * out of reach of a render test with it (`tests/programme-note.test.ts` says so in as
 * many words). `RatingControl` is a control worth rendering in a test, so it reaches its
 * write through this file instead, exactly as `useWatchMark` reaches `watch-action.ts`.
 *
 * The outcome shape is the one its sibling writes already established, minus a value:
 * there is nothing to read back. `rating` is a stored column, not a derived one — unlike
 * `unabandonAction`, whose landed state has to come from the view rather than from the
 * caller's guess — so a successful write tells the control only that the value it already
 * put on screen is now the value in the database.
 */
export type RatingOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function rateTitleAction(
  libraryEntryId: string,
  rating: number,
): Promise<RatingOutcome> {
  const userId = await requireUserId();

  try {
    await rateTitle(userId, libraryEntryId, rating);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "rating" }) };
  }

  /**
   * The library grid does not print a rating today, so this bust changes nothing anybody
   * can see — and it is here anyway, because the row it wrote is the row the library
   * reads. `cache/tags.ts`'s `INVALIDATES` argues that in full; the short version is
   * that the day `LibraryEntryRow` grows a rating is not the day anybody will remember to
   * come back here.
   */
  invalidateFor("rateTitle", userId);
  return { ok: true };
}
