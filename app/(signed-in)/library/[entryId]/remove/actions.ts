"use server";

import { revalidatePath } from "next/cache";

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
 *
 * ── The invalidation names `/library` — issue #179 ───────────────────────────────────
 *
 * `remove-title-form.tsx` used to call `router.refresh()` before navigating, to stop the
 * library being served a grid that still had this title in it. That was a second round
 * trip, and it refreshed the wrong route: the one it refreshed was **this** page, which
 * the reader is in the act of leaving, while the route it was protecting was `/library`.
 *
 * `revalidatePath("/library")` names the affected path instead, and it runs only after the
 * `DELETE` has committed — a refused removal invalidates nothing, because nothing changed.
 *
 * ── What it actually costs, which is more than the name suggests ─────────────────────
 *
 * Two costs, both read off `node_modules/next/dist/docs/` rather than assumed, because
 * `AGENTS.md` opens by saying this is not the Next.js you know:
 *
 * 1. A Server Function that revalidates has Next.js re-render the **current** route and
 *    return its RSC payload with the action's own response
 *    (`02-guides/server-actions.md`). So this page renders once more on the way out.
 * 2. `04-functions/revalidatePath.md` — *Currently, it also causes all previously visited
 *    pages to refresh when navigated to again. This behavior is temporary and will be
 *    updated in the future to apply only to the specific path.*
 *
 * The second one deserves saying plainly, in a ticket whose whole subject is writes that
 * re-render too much: **today this is the broadest invalidation in the app, not the
 * narrowest.** What the argument for it rests on is that the breadth is Next.js's and is
 * documented as temporary, while the *path* is this call's own and is exactly one; when
 * that behaviour is fixed upstream this line needs no edit to become what it reads as.
 * The alternative was not "something narrower" — it was `router.refresh()`, which cost a
 * second round trip and pointed at the wrong route, or nothing at all, which would leave
 * a `/library` entry restored by the Back button still showing a destroyed title.
 *
 * `lists-surface.tsx` reaches the opposite conclusion about that same Back button, and
 * deliberately: nothing is destroyed there, so a stale restore costs a list briefly
 * missing rather than a title the reader was told was gone.
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

  revalidatePath("/library");
  return { ok: true };
}
