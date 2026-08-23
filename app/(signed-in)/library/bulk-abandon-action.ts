"use server";

import { invalidateFor } from "@/cache/tags";
import { abandonTitles } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The selection bar's second press — give up on every selected title at once, issue #199,
 * on top of `db/access.ts`'s `abandonTitles`.
 *
 * ── Why this is its own file and not a third export of `title-detail-actions.ts` ─────
 *
 * `rating-action.ts`'s reason, and it bites harder here. That module imports
 * `tmdb/catalogue.ts`, which is `server-only` — a sentinel that throws on import outside
 * Next's own build and takes every module in its import graph down with it. The single
 * title's `abandonAction` lives there and can, because `abandon-control.tsx` is not a
 * module any suite imports. This one is reached from `bulk-selection.ts`, which
 * `tests/bulk-selection.test.ts` imports directly and drives without a server — so an
 * import edge from the store to `title-detail-actions.ts` would take the whole ticket's
 * test out of reach, which is the one thing issue #197 built that store to make possible.
 *
 * ── The set, not a loop, and no partial variant to report ────────────────────────────
 *
 * `AddTitlesToListActionOutcome`'s shape, for its reason: `abandonTitles` is one
 * transaction, so `ok: false` means **nothing** was written and there is nowhere for a
 * partial answer to go. `abandoned` counts the entries actually changed, which is smaller
 * than the selection whenever it held titles that were already given up on — the bar
 * treats any `ok` as success, because *the library now says what I asked it to say* is the
 * only question the reader was asking.
 *
 * ── The invalidation is a tag now, not two paths — issue #219 ───────────────────────
 *
 * This action used to call `revalidatePath("/library")` and `revalidatePath("/up-next")`,
 * and argued at length about which paths deserved naming. Both calls are gone, because
 * the thing they were naming has changed underneath them: `/library`'s read is cached and
 * tagged (`cache/tags.ts`), so `invalidateFor` busts **this account's library and nothing
 * else** on the server — where `revalidatePath` was, in the docs' own words, *"currently
 * also causing all previously visited pages to refresh"*. The narrow call replaces the
 * broad one, and it is narrow on the axis that matters: one account, not one path.
 *
 * `/up-next` is dropped rather than translated, and the reason is that it never had a
 * server cache to invalidate — it is `force-dynamic` and uncached, as that docblock said
 * itself: *"neither is being rescued from a stale server cache — the client's is the one
 * in question."* The client's is still handled, and by the same mechanism as before:
 * `updateTag` in a Server Action marks the path revalidated, which is what makes the
 * browser evict its prefetch cache whole (`server-action-reducer.js`). So a reader who
 * taps across to Up next after this press still gets a fresh screen. When issue #226
 * caches that read, it gets a tag of its own and this call gains a second line — which is
 * the point of the map in `cache/tags.ts` being the place that decides.
 *
 * What has not changed is the re-render: a Server Function that invalidates has Next.js
 * render the **current** route again and return its RSC payload with the action's own
 * response (`02-guides/server-actions.md`). This press happens on `/library` and stays
 * there, so that re-render is the whole mechanism rather than an incidental cost — it is
 * what makes the grid behind the bar read *abandoned* the moment the mode ends, with no
 * second round trip and nothing optimistic to put back on failure. `updateTag` rather
 * than `revalidateTag` is what makes that re-render see this write; `cache/tags.ts` has
 * the paragraph on why those two are not interchangeable.
 */
export type AbandonTitlesActionOutcome =
  | { readonly ok: true; readonly abandoned: number }
  | { readonly ok: false; readonly reference: string | null };

export async function abandonTitlesAction(
  libraryEntryIds: readonly string[],
): Promise<AbandonTitlesActionOutcome> {
  const userId = await requireUserId();

  let abandoned: number;

  try {
    /**
     * Nothing is half-given-up-on for this branch to have to describe. `abandonTitles` is
     * one transaction over one `UPDATE`, which Postgres commits or rolls back as a unit —
     * so the failure the store reports is *nothing changed* rather than *some of it may
     * have*, and there is one toast to raise rather than a set to reconcile.
     */
    abandoned = (await abandonTitles(userId, libraryEntryIds)).abandoned;
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "bulk-abandon" }) };
  }

  // Only after the write committed, and only when it changed something. A press over a
  // selection that was already abandoned wrote nothing, so there is nothing for the
  // cached library to be stale about and a bust would only throw away a correct entry.
  if (abandoned > 0) invalidateFor("abandonTitles", userId);

  return { ok: true, abandoned };
}
