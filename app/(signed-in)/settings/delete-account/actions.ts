"use server";

import { invalidateFor } from "@/cache/tags";
import { deleteAccount } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { clearSessionCookie, requireUserId } from "@/lib/session";
import { confirmationMatches } from "./confirmation";

/**
 * The irreversible write — issue #125, and the only write this route makes.
 *
 * ── There is exactly one of these, and it takes the typed word ───────────────────────
 *
 * The argument is what the reader typed, not a boolean the browser computed. A `disabled`
 * attribute is a claim the page makes about itself, and a Server Action is a public
 * endpoint: anything that can reach this route can call this function with nothing typed
 * at all. So the same predicate that greys the button out decides here too —
 * `confirmation.ts`, imported by both, so the two can never drift into disagreeing about
 * what the word is.
 *
 * ── Caught rather than thrown ────────────────────────────────────────────────────────
 *
 * React strips a thrown Server Action error before it reaches the browser, so catching is
 * what gets the real exception to Sentry and a reference id — rather than a generic
 * message and a `digest` — onto this screen's inline failure treatment. Same shape as
 * `welcome/actions.ts` and `search/actions.ts`, and the same reason.
 *
 * The `catch` is not the thing `AGENTS.md` forbids: nothing here manufactures a
 * successful-looking empty result out of a failure. It reports, and then says the deletion
 * did not happen.
 */
export type DeleteAccountOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function deleteAccountAction(
  confirmation: string,
): Promise<DeleteAccountOutcome> {
  const userId = await requireUserId();

  if (!confirmationMatches(confirmation)) {
    /**
     * Unreachable through the page, which is why it is reported rather than merely
     * refused: a call that arrives here without the word means either a bug that unarmed
     * the button's own rule, or a request built by hand. Both are worth an event.
     *
     * The reader is told the same thing a failed delete tells them — their account is
     * intact and they are still signed in — because that is what is true, and because
     * inventing a second failure surface for a state the page cannot produce would be a
     * fifth error treatment for nobody.
     */
    return {
      ok: false,
      reference: referenceFor(
        new Error("Account deletion was called without the confirmation word."),
        { surface: "delete-account" },
      ),
    };
  }

  try {
    await deleteAccount(userId);
  } catch (error) {
    /**
     * The account is intact, and that is a property of the statement rather than a hope:
     * `deleteAccount` is one `DELETE` and the cascades it fires, which Postgres commits or
     * rolls back as a unit. There is no half-deleted account for this branch to have to
     * describe, which is what lets the failure block on the form say *nothing was
     * destroyed* rather than *some of it may have been*.
     */
    return { ok: false, reference: referenceFor(error, { surface: "delete-account" }) };
  }

  /**
   * The account's rows are gone; its cache entries are not, and an entry nothing will
   * ever bust again is an entry holding a deleted library (issue #219). Better Auth mints
   * a fresh id per account, so nobody inherits this one and nobody would be shown it —
   * but *unreachable* and *dropped* are not the same thing, and the account deletion this
   * app promises should not leave the last read of that library sitting in a cache.
   *
   * All four facts since #226, and this is the write where the map earns most: an account
   * deletion cascades through every owned table, so *which of them was cached* is exactly
   * the question nobody should have to answer again at this call site.
   */
  invalidateFor("deleteAccount", userId);

  /**
   * After the delete, never before — see `clearSessionCookie`. The session row went with
   * the account, so the reader is already revoked server-side; this only stops the browser
   * from carrying a token that names nobody.
   */
  await clearSessionCookie();

  return { ok: true };
}
