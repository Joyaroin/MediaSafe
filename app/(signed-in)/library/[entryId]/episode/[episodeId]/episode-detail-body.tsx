import { notFound } from "next/navigation";

import { TmdbAttribution } from "@/app/tmdb-attribution";
import { locateEpisode } from "@/app/(signed-in)/library/episode-run";
import { cachedTitleDetail } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { EpisodeDetailView } from "./episode-detail-view";
import { EpisodeSynopsisStreamed } from "./episode-synopsis-streamed";

/**
 * The episode surface itself — the read, the miss, and everything the reader looks at —
 * with no opinion about whether it is a page or a modal.
 *
 * ── Why this is a component and not the body of `page.tsx` ───────────────────────────
 *
 * Issue #254 gives this route a second render: the intercepted one in the signed-in
 * layout's `@modal` slot, which shows the *same* episode from the same read over whatever
 * the reader was looking at. Two files rendering that from two copies of the same eight
 * lines is the arrangement where one of them quietly stops calling `notFound()`, or reads
 * a different cache entry, and the two surfaces begin disagreeing about an episode the
 * reader believes is one thing.
 *
 * So the split is: this file is *the episode*, `page.tsx` is *the page it is on* and
 * `@modal/(.)…/page.tsx` is *the dialog it arrives in*. Both of those are four lines long
 * and neither of them reads anything.
 *
 * Every argument for how this reads — one cache entry, authorisation through
 * `getTitleDetail`, the day in the key, an unguarded call so a failure throws, and a
 * `notFound()` for an episode this show does not have — is `page.tsx`'s and is written out
 * there in full. Nothing about it changed when it moved; it is a projection of title
 * detail's read, as it was.
 */
export async function EpisodeDetailBody({
  entryId,
  episodeId,
}: {
  readonly entryId: string;
  readonly episodeId: string;
}) {
  const userId = await requireUserId();
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
