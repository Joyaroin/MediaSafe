import { notFound } from "next/navigation";

import { TmdbAttribution } from "@/app/tmdb-attribution";
import { locateEpisode } from "@/app/(signed-in)/library/episode-run";
import { cachedTitleDetail } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { EpisodeDetailView } from "./episode-detail-view";
import { EpisodeSynopsisStreamed } from "./episode-synopsis-streamed";

/**
 * **An episode you can read** — issue #253. A full page at its own URL beneath the library
 * entry that owns it, and the surface issue #254 will present as a modal over whatever the
 * reader was looking at. This ticket is the page that modal will show; nothing here knows
 * about the modal, and a direct load or a refresh is meant to land exactly here.
 *
 * ── It is a projection of title detail's read, not a read of its own ─────────────────
 *
 * This page calls `cachedTitleDetail` — the same wrapper, with the same account and the
 * same entry id, that `[entryId]/page.tsx` and `titleDetailAction` already call. It then
 * finds one episode inside the answer (`episode-run.ts`). There is no `getEpisodeDetail`,
 * and that is the central decision of this ticket rather than an economy:
 *
 * - **One cache entry, so two surfaces cannot disagree.** The show's page and this page
 *   are the same read. An episode cannot be struck on one and unstruck on the other,
 *   because there is nothing for them to disagree *with* — the entry is `title-detail`,
 *   tagged and busted by the writes that already bust it (`cache/tags.ts`), including the
 *   marks this page itself records.
 * - **Authorisation is `getTitleDetail`'s, unchanged.** It scopes by
 *   `ownedBy(userId, libraryEntry)` and throws when the entry is not this account's. So
 *   *an unowned title has no episode page* needs no check here: a title you have not added
 *   has no library entry, so there is no URL to build; and an entry id belonging to
 *   somebody else answers nothing rather than someone else's episode.
 * - **`coveredUpTo` needs the run anyway.** *Watched up to here* is a rule over every
 *   episode before this one, so a read scoped to one episode would have had to be joined
 *   by a second read of all of them.
 *
 * The cost is one query returning a show's whole episode list to render one of them. It is
 * a query that is usually already cached, and `EpisodeDetailView`'s docblock is where the
 * payload half of that trade is argued.
 *
 * **The day is in the key**, as it is for the show's page and for the same reason: an
 * episode's `released` flag is read off `air_date <= current_date`, so the answer changes
 * at midnight with no write behind it (`cache/tags.ts`'s `serverDay`, and ADR-0003).
 *
 * ── A page read, so a failure throws ────────────────────────────────────────────────
 *
 * `cachedTitleDetail` is called directly and unguarded. A failure throws into `error.tsx`
 * beside this file — the shape every page render in this application uses, and the reason
 * `AGENTS.md`'s first rule needs no `try` here: there is no `catch` that could turn a
 * database being down into an episode that is not there.
 *
 * ── An episode this show does not have is `notFound`, not a failure ─────────────────
 *
 * `locateEpisode` answers `null` for an id that is not in this show's list — a stale
 * bookmark, an episode a sweep repointed, a hand-edited URL, or a **film**, which has no
 * episodes at all and so can never resolve one. That is a read that succeeded and found
 * nothing, which is the one distinction this codebase is built around: rendering *this did
 * not load* over it would be `AGENTS.md`'s opening rule told backwards. `notFound()` is
 * what a route with no such episode beneath it is.
 *
 * ── The synopsis is built here and never awaited ────────────────────────────────────
 *
 * `<EpisodeSynopsisStreamed>` is a Server Component constructed on this line and handed to
 * `EpisodeDetailView` as an already-rendered node. This page never awaits it, so the
 * mirrored read above is all that gates the shell, and TMDB gates one section of it.
 * `[entryId]/page.tsx` hands `LiveTitleFactsStreamed` down the same way.
 */
export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ entryId: string; episodeId: string }>;
}) {
  const { entryId, episodeId } = await params;
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
          conditional footer: this page only renders once the mirrored read has succeeded,
          so borrowed data — the still, the name, the air date — is on the glass the moment
          there is a page to attribute it on. */}
      <TmdbAttribution className="mt-4 px-6 py-3" />
    </>
  );
}
