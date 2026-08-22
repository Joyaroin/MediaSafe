"use server";

import { revalidatePath } from "next/cache";

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
 * ── The invalidation names `/library` ────────────────────────────────────────────────
 *
 * `remove/actions.ts` (issue #179) is the precedent and the argument, including the part
 * about `revalidatePath` today being broader than its name — read that docblock rather
 * than a second copy of it here. The difference is where the reader is standing. Removal
 * revalidates the route it is *leaving*; this press happens on `/library` and stays there,
 * so the re-render Next.js does of the current route — returning its RSC payload with this
 * action's own response (`02-guides/server-actions.md`) — is not an incidental cost but the
 * whole mechanism: it is what makes the grid behind the bar read *abandoned* the moment
 * the mode ends, with no second round trip and nothing optimistic to put back on failure.
 *
 * `/up-next` is named too, and for a reason `/library` does not need: an abandoned title
 * leaves the four watching groups and joins ABANDONED, so a reader who taps across to it
 * after this press would otherwise be served the Router Cache's copy of a screen this
 * write invalidated. Both routes are `force-dynamic`, so neither is being rescued from a
 * stale *server* cache — the client's is the one in question.
 *
 * **The two named paths are not what makes the other surfaces correct today, and this
 * paragraph exists because an earlier draft claimed they were.** It argued the five group
 * screens under `/up-next/*` were deliberately left alone, which contradicted the very
 * docblock the paragraph above sends the reader to: `remove/actions.ts` quotes
 * `04-functions/revalidatePath.md` saying the call *"currently also causes all previously
 * visited pages to refresh when navigated to again."* While that holds, every one of those
 * screens is refreshed whether or not it is named, and so is every other route the reader
 * has been to.
 *
 * Naming these two is therefore about what happens **when that breadth goes away** — the
 * docs call the behaviour temporary — not about what is true now. `/library` is the one
 * that would still be load-bearing on that day, because it is the route the press happens
 * on and the only one whose freshness the reader sees immediately; `/up-next` is named
 * because it is the other surface this write changes the meaning of, and one line now is
 * cheaper than diagnosing a stale tab later. The five group screens stay unnamed on the
 * ordinary grounds that they are reached from `/up-next` and a reader has to go looking
 * for them — a judgement about cost, which is all it ever was, rather than a claim that
 * they are stale, which was never true.
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
  // selection that was already abandoned wrote nothing, so there is nothing for either
  // route to be stale about.
  if (abandoned > 0) {
    revalidatePath("/library");
    revalidatePath("/up-next");
  }

  return { ok: true, abandoned };
}
