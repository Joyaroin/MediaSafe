import { notFound } from "next/navigation";

import { TmdbAttribution } from "@/app/tmdb-attribution";
import { locateEpisode } from "@/app/(signed-in)/library/episode-run";
import { cachedLibraryEntryIdForEpisode, cachedTitleDetail } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { EpisodeDetailView } from "./episode-detail-view";
import { EpisodeSynopsisStreamed } from "./episode-synopsis-streamed";

/**
 * The episode surface itself — the read, the miss, and everything the reader looks at.
 *
 * ── Why this is a component and not the body of `page.tsx` ───────────────────────────
 *
 * Issue #254 gave this route a second render: an intercepted one in the signed-in
 * layout's `@episode` slot, which showed the *same* episode from the same read over
 * whatever the reader was looking at. Two files rendering that from two copies of the same
 * eight lines is the arrangement where one of them quietly stops calling `notFound()`, or
 * reads a different cache entry, and the two surfaces begin disagreeing about an episode
 * the reader believes is one thing. So the split was: this file is *the episode*,
 * `page.tsx` is *the page it is on*, and the slot's own page was *the dialog it arrived
 * in*.
 *
 * **Issue #273 deletes the interception**, so there is one render again — and the split
 * stays. `page.tsx` is a route file that reads nothing, this is the surface, and putting
 * the read, the `notFound()` and the streamed synopsis back into a route body would be a
 * second rewrite riding on the deletion of a slot.
 *
 * Every argument for how this reads — one cache entry, authorisation through `ownedBy`,
 * the day in the key, unguarded calls so a failure throws, and a `notFound()` for an
 * episode that resolves to nothing — is `page.tsx`'s and is written out there in full. It
 * is a projection of title detail's read, as it was.
 *
 * ── The entry is resolved here, not handed down — issue #289 ─────────────────────────
 *
 * The route carries the episode's id alone, so the first thing this does is ask which of
 * this reader's entries holds it (`cachedLibraryEntryIdForEpisode`). `layout.tsx` used to
 * ask the same question for the back bar's destination and share the cache entry; #292
 * gave the bar an origin to name instead of a show to point at, so this is the only caller
 * left and the read happens once, inside the boundary that belongs to it.
 */
export async function EpisodeDetailBody({
  episodeId,
}: {
  readonly episodeId: string;
}) {
  const userId = await requireUserId();

  const entryId = await cachedLibraryEntryIdForEpisode(userId, episodeId);
  // An episode id naming nothing, or naming an episode of a title this account has not
  // added. Both are a read that succeeded and found nothing — see `page.tsx`.
  if (entryId === null) notFound();

  const detail = await cachedTitleDetail(userId, entryId);

  const located = locateEpisode(detail.episodes, episodeId);
  if (located === null) notFound();

  return (
    <>
      <EpisodeDetailView
        libraryEntryId={detail.libraryEntryId}
        titleName={detail.name}
        episodes={detail.episodes}
        located={located}
        synopsis={
          <EpisodeSynopsisStreamed
            userId={userId}
            tmdbId={detail.tmdbId}
            seasonNo={located.episode.seasonNo}
            episodeNo={located.episode.episodeNo}
          />
        }
      />

      {/* Always on screen, like the title route's and unlike the desktop pane's
          conditional footer: this renders only once the mirrored read has succeeded, so
          borrowed data — the still, the name, the air date — is on the glass the moment
          there is something to attribute it on. */}
      <TmdbAttribution className="mt-4 px-6 py-3" />
    </>
  );
}
