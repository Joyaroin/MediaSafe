"use server";

import { removeTitleFromLibrary } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The irreversible write — issue #142, and the only write this route makes.
 *
 * ── Caught rather than thrown ────────────────────────────────────────────────────────
 *
 * React strips a thrown Server Action error before it reaches the browser, so catching is
 * what gets the real exception to Sentry and a reference id — rather than a generic message
 * and a `digest` — onto this screen's failure treatment. Same shape as
 * `settings/delete-account/actions.ts`, `welcome/actions.ts` and `search/actions.ts`, and
 * the same reason.
 *
 * The `catch` is not the thing `AGENTS.md` forbids: nothing here manufactures a
 * successful-looking empty result out of a failure. It reports, and then says the removal
 * did not happen.
 *
 * ── There is no confirmation argument, and that is not an omission ───────────────────
 *
 * `deleteAccountAction` takes the word the reader typed because its page arms a button with
 * one; this one takes nothing but the entry id. The ceremony here is the page itself — a
 * route you have to reach, with this title's real numbers on it — which is what the ticket
 * asks for and all it asks for. Adding a typed word would not make the endpoint any safer
 * than it already is: a Server Action is a POST anyone can call, and what stops a call that
 * did not come from this page destroying somebody else's title is `ownedBy` inside
 * `removeTitleFromLibrary`, never a string the caller also controls.
 */
export type RemoveTitleOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function removeTitleAction(
  libraryEntryId: string,
): Promise<RemoveTitleOutcome> {
  const userId = await requireUserId();

  try {
    await removeTitleFromLibrary(userId, libraryEntryId);
  } catch (error) {
    /**
     * The entry is intact, and that is a property of the statement rather than a hope:
     * `removeTitleFromLibrary` is one `DELETE` and the cascade it fires, which Postgres
     * commits or rolls back as a unit. There is no half-removed title for this branch to
     * have to describe, which is what lets the failure block say *nothing was destroyed*
     * rather than *some of it may have been*.
     */
    return {
      ok: false,
      reference: referenceFor(error, { surface: "remove-from-library" }),
    };
  }

  return { ok: true };
}
