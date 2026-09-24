import { BackBar } from "@/app/(signed-in)/back-bar";
import { CastStreamed, SynopsisStreamed, WatchProvidersStreamed } from "@/app/(signed-in)/library/live-title-facts-streamed";
import { TmdbAttribution } from "@/app/tmdb-attribution";
import { cachedTitleDetail } from "@/cache/tags";
import { requireTimezone, requireUserId } from "@/lib/session";
import { readerDay } from "@/app/(signed-in)/up-next/upcoming-grouping";
import { TitleDetailView } from "./title-detail-view";

/**
 * Title detail's content — the same split, and for the same reason, as
 * `episode-detail-body.tsx`.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────────────
 *
 * There were two renders of this route and there is one screen. Which one a
 * reader got was the framework's decision, not this file's: intercepted into the `@title`
 * slot for a press inside the app, the full page for an address typed, shared or
 * refreshed. The thing that must not vary between them is *what title detail is*, so it
 * was written once.
 *
 * ── One render since issue #273, and `overlaid` is gone with the other one ───────────
 *
 * The interception is deleted: pressing a library cell, a rail tile or a search result
 * navigates to this page rather than raising a sheet over the screen the reader was on.
 * The flag this file carried changed the **back bar** and nothing else — it was suppressed
 * inside the dialog, where the bar would have been a third way out beside Close,
 * Escape and the swipe, and a lying one, since the library was still on screen underneath.
 * There is no dialog, so the bar is unconditional and is again the way back.
 *
 * The file itself stays rather than folding into `page.tsx`: the route file reads nothing
 * and this is the surface, which is the arrangement `episode-detail-body.tsx` keeps for
 * the same reason. The read is unguarded either way, so a failure throws into `error.tsx`
 * above it and nothing catches, per the rule.
 */
export async function TitleDetailBody({
  entryId,
}: {
  readonly entryId: string;
}) {
  const userId = await requireUserId();
  const [detail, zone] = await Promise.all([
    cachedTitleDetail(userId, entryId),
    requireTimezone(),
  ]);

  return (
    <>
      <BackBar />

      {/* Three streamed sections, three nodes: the synopsis renders inside the hero's card,
          the providers in a card below the episodes, the cast last. They were two nodes
          until the synopsis moved — `programme-note-content.tsx` has the argument, and
          nothing about the streaming itself changed. */}
      <TitleDetailView
        detail={detail}
        today={readerDay(zone, new Date())}
        synopsis={<SynopsisStreamed userId={userId} kind={detail.kind} tmdbId={detail.tmdbId} />}
        watchProviders={
          <WatchProvidersStreamed userId={userId} kind={detail.kind} tmdbId={detail.tmdbId} />
        }
        cast={<CastStreamed userId={userId} kind={detail.kind} tmdbId={detail.tmdbId} />}
      />

      {/* Always on screen, unlike the desktop pane's conditional footer: nothing here
          renders until the mirrored read above has succeeded, so borrowed data is on
          screen the moment there is anything to attribute it on. */}
      <TmdbAttribution className="mt-4 px-gutter py-3" />
    </>
  );
}
