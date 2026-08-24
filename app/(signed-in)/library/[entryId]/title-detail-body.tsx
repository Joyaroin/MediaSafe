import { TmdbAttribution } from "@/app/tmdb-attribution";
import { cachedTitleDetail } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { CastStreamed, LiveTitleFactsStreamed } from "../live-title-facts-streamed";
import { BackToLibraryBar } from "./back-to-library-bar";
import { TitleDetailView } from "./title-detail-view";

/**
 * Title detail's content, shared by the route that pushes it and the dialog that overlays
 * it — the same split, and for the same reason, as `episode-detail-body.tsx`.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────────────
 *
 * There are two renders of `/library/[entryId]` and there is one screen. Which one a
 * reader gets is the framework's decision, not this file's: intercepted into `@title` for
 * a press inside the app, the full page for an address typed, shared or refreshed. The
 * thing that must not vary between them is *what title detail is*, so it is written once.
 *
 * ── `overlaid`, and the one thing it changes ─────────────────────────────────────────
 *
 * The **back bar**, and nothing else. On the route it is the only way out, and it says
 * `‹ Library` because the library is where you came from. In the dialog it would be a
 * third way out beside Close, Escape and the swipe — and it would be a *lying* one, since
 * the library is not somewhere to go back to when it is still on screen underneath.
 *
 * The read is not conditional on it. Both renders call `cachedTitleDetail` unguarded, so
 * a failure throws into whichever boundary is above — `error.tsx` on the route, the
 * intercepted `error.tsx` inside the dialog frame. Neither catches, per `SPEC.md` §3.
 */
export async function TitleDetailBody({
  entryId,
  overlaid = false,
}: {
  readonly entryId: string;
  readonly overlaid?: boolean;
}) {
  const userId = await requireUserId();
  const detail = await cachedTitleDetail(userId, entryId);

  return (
    <>
      {overlaid ? null : <BackToLibraryBar />}

      <TitleDetailView
        detail={detail}
        liveFacts={
          <LiveTitleFactsStreamed userId={userId} kind={detail.kind} tmdbId={detail.tmdbId} />
        }
        cast={<CastStreamed userId={userId} kind={detail.kind} tmdbId={detail.tmdbId} />}
      />

      {/* Always on screen, unlike the desktop pane's conditional footer: nothing here
          renders until the mirrored read above has succeeded, so borrowed data is on
          screen the moment there is anything to attribute it on. */}
      <TmdbAttribution className="mt-4 px-6 py-3" />
    </>
  );
}
