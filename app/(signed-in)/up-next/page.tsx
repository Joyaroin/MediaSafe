import { listUpNext } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { UpNextEmpty } from "./up-next-empty";
import { UpNextHeading } from "./up-next-heading";
import { UpNextSurface } from "./up-next-surface";

/**
 * The phone's landing screen — built at its own route by issue #101, made the landing
 * screen and a tab by #102 (`app/tab-bar.tsx`, `app/page.tsx`).
 *
 * `listUpNext` is #98's one definition of what is next, read directly and unguarded —
 * the same shape `app/(signed-in)/library/page.tsx` and the phone title-detail route use.
 * A failure throws into `error.tsx`; an empty page (`entries.length === 0`) is reachable
 * only from a query that succeeded, and is `UpNextEmpty`, never this page's own branch of
 * `error.tsx`'s treatment.
 *
 * `UpNextSurface` owns everything past the first page — the dominant card, the compact
 * deck, and paging further pages in as the deck is worked down. This page hands it only
 * the first one, the same "one server read, one client shell" split
 * `app/(signed-in)/library/[entryId]/title-detail-view.tsx` uses.
 */
export const dynamic = "force-dynamic";

export default async function UpNextPage() {
  const userId = await requireUserId();
  const page = await listUpNext(userId);

  return (
    <main className="flex w-full flex-1 flex-col">
      <UpNextHeading />
      {page.entries.length === 0 ? <UpNextEmpty /> : <UpNextSurface firstPage={page} />}
    </main>
  );
}
