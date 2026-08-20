import { TmdbAttribution } from "@/app/tmdb-attribution";
import { getListDetail } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { BackToListsBar } from "../back-to-lists-bar";
import { EmptyListDetail } from "./empty-list-detail";
import { ReorderableTitleList } from "./reorderable-title-list";

/**
 * One list's contents, in order — issue #147. `lists/page.tsx`'s own row said *"nothing
 * here to click into yet"*; this is that destination.
 *
 * ── A page read, unguarded, the same shape as `getTitleDetail`'s callers ─────────────
 *
 * `getListDetail` is called directly with no `try` around it: a failure throws into
 * `error.tsx` below, which is `AGENTS.md`'s error discipline in one line — a database
 * MediaSafe cannot reach must never render as a list with nothing in it. That throw is
 * also what makes *one account cannot read another account's list* true here: a tampered
 * or foreign id answers the same way a missing one does.
 */
export const dynamic = "force-dynamic";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const userId = await requireUserId();
  const detail = await getListDetail(userId, listId);

  return (
    <main className="flex w-full flex-1 flex-col">
      <BackToListsBar>
        <h1 className="bill-title mt-3 text-bill-sm text-text">{detail.name}</h1>
      </BackToListsBar>

      {detail.titles.length === 0 ? (
        <EmptyListDetail />
      ) : (
        <ReorderableTitleList listId={detail.id} initialTitles={detail.titles} />
      )}

      {detail.titles.length === 0 ? null : (
        <TmdbAttribution className="mt-4 px-6 py-3" />
      )}
    </main>
  );
}
