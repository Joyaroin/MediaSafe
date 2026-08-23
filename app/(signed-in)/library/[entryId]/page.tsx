import { TmdbAttribution } from "@/app/tmdb-attribution";
import { cachedTitleDetail } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { LiveTitleFactsStreamed } from "../live-title-facts-streamed";
import { BackToLibraryBar } from "./back-to-library-bar";
import { TitleDetailView } from "./title-detail-view";

/**
 * Title detail, on the phone — a route you push and pop (issue #58, and the third of the
 * three genuine desktop/phone divergences, `docs/design/v1-surfaces.md` §5). The desktop
 * pane (`programme-note.tsx`) shows the identical content without ever navigating here;
 * this file exists because the phone's whole reason for choosing a route over a pane is
 * that back should do what back does, and only a real route gives it a history entry to
 * pop.
 *
 * ── A page read, not a Server Action ──────────────────────────────────────────────────
 *
 * Unlike the desktop pane, this is a page render: `cachedTitleDetail` is called directly
 * and unguarded, so a failure throws into `error.tsx` below — the same shape
 * `app/(signed-in)/library/page.tsx` uses for the grid. `title-detail-actions.ts`'s own
 * docblock is why the pane cannot do the same: it never navigates, so it has no route
 * boundary to throw into.
 *
 * ── Cached since #226, and this route and the pane share the entry ──────────────────
 *
 * `cache/tags.ts` wraps the mirrored read, keyed by this account and tagged `title-detail`
 * — the same wrapper `titleDetailAction` calls for the desktop pane, so the two surfaces
 * are one cache entry and cannot disagree about a title's state, rating or watched
 * episodes. Every write that changes any of those busts the tag inside its own action.
 *
 * The **day is in the key**, unlike the lists: an episode's `released` flag is read off
 * `air_date <= current_date`, so the season grid grows at midnight with no write behind it
 * (`cache/tags.ts`'s `serverDay`, and ADR-0003).
 *
 * ── The three live facts stream in behind this render, not after it mounts (issue #218) ──
 *
 * `<LiveTitleFactsStreamed>` (`live-title-facts-streamed.tsx`) is a Server Component built
 * right here and handed to `TitleDetailView` as an already-rendered node — this page never
 * awaits it, so the mirrored read above is all that gates this page's own shell. Each of
 * the three live reads runs inside its own `Suspense`, streamed in independently once
 * `getTitleDetail` above has already resolved.
 */
export const dynamic = "force-dynamic";

export default async function TitleDetailPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const userId = await requireUserId();
  const detail = await cachedTitleDetail(userId, entryId);

  return (
    <main className="flex w-full flex-1 flex-col">
      <BackToLibraryBar />

      <TitleDetailView
        detail={detail}
        liveFacts={
          <LiveTitleFactsStreamed
            userId={userId}
            kind={detail.kind}
            tmdbId={detail.tmdbId}
          />
        }
      />

      {/* Always on screen here, unlike the desktop pane's conditional footer: this route
          only ever renders once the mirrored read above has already succeeded, so
          borrowed data is on screen the moment there is a page to attribute it on. */}
      <TmdbAttribution className="mt-4 px-6 py-3" />
    </main>
  );
}
