"use server";

import { invalidateFor } from "@/cache/tags";
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
 * ── The invalidation names this account's library — issues #179, then #219 ───────────
 *
 * `remove-title-form.tsx` used to call `router.refresh()` before navigating, to stop the
 * library being served a grid that still had this title in it. That was a second round
 * trip, and it refreshed the wrong route: the one it refreshed was **this** page, which
 * the reader is in the act of leaving, while the route it was protecting was `/library`.
 *
 * #179 replaced it with `revalidatePath("/library")`, and said plainly what that cost:
 * `04-functions/revalidatePath.md` documents the call as *currently also causing all
 * previously visited pages to refresh*, so **it was the broadest invalidation in the app,
 * not the narrowest** — held on the argument that the breadth was Next.js's and
 * documented as temporary.
 *
 * #219 made that argument unnecessary rather than waiting for it to come true. `/library`
 * now has a cached read with a tag on it, so `invalidateFor` busts one account's facts and
 * nobody else's on the server.
 *
 * **Four facts, since #226**, and the fourth is the one worth naming: removing a title
 * busts `lists` as well as `library`, `up-next` and `title-detail`, because `getListDetail`
 * left-joins `library_entry` and issue #133 decided a list survives its titles leaving the
 * library. The membership stays; its `libraryEntryId` goes `null`. A bust that named only
 * the library would leave every list holding this title claiming the reader still owns it,
 * with no expiry behind the entry to heal.
 *
 * Two things about the mechanism are worth keeping in view, both
 * read off `node_modules/next/dist/docs/` and Next's own source rather than assumed,
 * because `AGENTS.md` opens by saying this is not the Next.js you know:
 *
 * 1. A Server Function that invalidates has Next.js re-render the **current** route and
 *    return its RSC payload with the action's own response
 *    (`02-guides/server-actions.md`). So this page still renders once more on the way out.
 * 2. The **client's** prefetch cache is still evicted whole, not per tag —
 *    `server-action-reducer.js` carries the upstream `TODO: Evict only segments with
 *    matching tags and/or paths`. That is the same breadth as before and it is still
 *    Next.js's rather than this line's; what changed is that the server no longer shares
 *    it, and this call needs no edit on the day the client stops sharing it either.
 *
 * It still runs only after the `DELETE` has committed — a refused removal invalidates
 * nothing, because nothing changed.
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

  invalidateFor("removeTitleFromLibrary", userId);
  return { ok: true };
}
