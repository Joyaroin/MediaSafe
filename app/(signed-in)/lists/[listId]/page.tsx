import { TmdbAttribution } from "@/app/tmdb-attribution";
import { cachedListDetail } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { ListDetailSurface } from "./list-detail-surface";

/**
 * One list's contents, in order — issue #147. `lists/page.tsx`'s own row said *"nothing
 * here to click into yet"*; this is that destination.
 *
 * ── A page read, unguarded, the same shape as `getTitleDetail`'s callers ─────────────
 *
 * `cachedListDetail` is called directly with no `try` around it: a failure throws into
 * `error.tsx` below, which is `AGENTS.md`'s error discipline in one line — a database
 * MediaSafe cannot reach must never render as a list with nothing in it. That throw is
 * also what makes *one account cannot read another account's list* true here: a tampered
 * or foreign id answers the same way a missing one does.
 *
 * ── Cached since #226, and the throw is what keeps it clean ─────────────────────────
 *
 * Through `cache/tags.ts`, keyed by this account and tagged `lists` with the destination's
 * own read. `listId` is an argument rather than part of the tag, so each list is its own
 * entry and one bust reaches all of them — `cachedListDetail`'s docblock argues why a
 * per-list tag would be the narrower thing that is easier to get wrong.
 *
 * A foreign or invented id still throws, and it throws **before** `unstable_cache` has a
 * resolved value to store, so there is no cache state in which a tampered id puts another
 * account's list where this account can read it.
 */
export const dynamic = "force-dynamic";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const userId = await requireUserId();
  const detail = await cachedListDetail(userId, listId);

  return (
    <main className="flex w-full flex-1 flex-col">
      {/* Keyed on the list, so moving from one list to another starts from its own name
          and order rather than the last one's client state. */}
      <ListDetailSurface key={detail.id} detail={detail} />

      {detail.titles.length === 0 ? null : (
        <TmdbAttribution className="mt-4 px-gutter py-3" />
      )}
    </main>
  );
}
