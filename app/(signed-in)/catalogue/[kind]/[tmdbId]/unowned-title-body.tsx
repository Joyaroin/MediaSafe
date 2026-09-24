import { redirect } from "next/navigation";

import { AddToListControl } from "@/app/(signed-in)/library/add-to-list-control";
import { LiveTitleFactsStreamed } from "@/app/(signed-in)/library/live-title-facts-streamed";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { BackBar } from "@/app/(signed-in)/back-bar";
import { TitleHero } from "@/app/(signed-in)/library/title-hero";
import { TmdbAttribution } from "@/app/tmdb-attribution";
import { cachedFindUnownedTitleDetail } from "@/cache/borrowed-facts";
import { cachedLibraryEntryIdForTitle } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { catalogueSummary } from "@/tmdb/catalogue";
import type { TitleKind } from "@/tmdb/mirror";
import { AddToLibraryControl } from "./add-to-library-control";
import { UnownedEpisodes } from "./unowned-episodes";

/**
 * Catalogue detail's content — the same split as `title-detail-body.tsx` and
 * `episode-detail-body.tsx`, and it arrived for the same reason: there were two renders of
 * this URL and there is one screen, so the screen is written once. Issue #273 deletes the
 * dialog that was the second render, and the split stays — the route file reads nothing
 * and this is the surface.
 *
 * Its own file rather than an export of `page.tsx`. A page module is the framework's, with
 * its own rules about what may be exported from it, and importing a component out of one
 * from a second route is a load-bearing assumption about a file Next owns.
 *
 * ── Two reads, because the screen now has two kinds of arrival ──────────────────────
 *
 * Issue #148 built this screen for a title sitting in one of your **lists**, and a list
 * membership guarantees a `title` row — so `getUnownedTitleDetail` reads the mirror and
 * throws when it is not there, which was correct for every caller it had.
 *
 * It has more callers now. A search result and a card in the *Because you watched* rail
 * are titles TMDB knows about and this database has never heard of, so the mirror read
 * cannot serve them: it throws *No film with TMDB id 275 is mirrored*, which is true and
 * is not the reader's problem.
 *
 * So the mirror is read first, through a variant that answers `null` rather than throwing
 * when the row is absent, and the catalogue is the fallback. Mirrored titles keep
 * everything they had — the episode list, and *Add to list*, which needs the `titleId`
 * only a mirror row has. An unmirrored one gets its facts live from TMDB in one request,
 * and is honestly missing those two things rather than pretending to them.
 *
 * `catalogueDetail` at the foot of this file has the argument for why that is a nullable
 * read and not a `catch`; it is the difference between a missing row and a database that
 * did not answer.
 *
 * ── What is deliberately **not** done here ──────────────────────────────────────────
 *
 * Mirroring the title on the way in. It would make both paths identical and give every
 * screen an `Add to list` control — and it would mean **looking** at a title wrote a row,
 * so a reader who opened five recommendations and added none would have quietly created
 * five titles and, for shows, every episode under them. Adding is a decision, and
 * `AddToLibraryControl` is where it is made.
 */
export async function UnownedTitleBody({
  kind,
  tmdbId,
}: {
  readonly kind: TitleKind;
  readonly tmdbId: number;
}) {
  const userId = await requireUserId();

  // A title already in the library has its own page; this one is for titles that are not.
  const owned = await cachedLibraryEntryIdForTitle(userId, kind, tmdbId);
  if (owned !== null) redirect(`/titles/${owned}`);

  const detail = await catalogueDetail(userId, kind, tmdbId);

  return (
    <>
      {/* Back to wherever the reader came from — Search, Up next, a list — rather than a
          hard-coded *Lists* that sent a reader who came from Search somewhere else. */}
      <BackBar />

      <div className="arrive-panel pb-10">
        <TitleHero
          name={detail.name}
          posterPath={detail.posterPath}
          meta={titleMetaLine(detail)}
          actions={
            <>
              <AddToLibraryControl
                key={`${detail.kind}:${detail.tmdbId}`}
                kind={detail.kind}
                tmdbId={detail.tmdbId}
                titleName={detail.name}
              />
              {detail.titleId === null ? null : (
                <AddToListControl
                  key={detail.titleId}
                  titleId={detail.titleId}
                  titleName={detail.name}
                />
              )}
            </>
          }
        />

        <div className="mt-6 flex flex-col gap-8 px-[22px] lg:px-10">
          <LiveTitleFactsStreamed userId={userId} kind={detail.kind} tmdbId={detail.tmdbId} />

          {detail.kind === "show" ? (
            <section aria-labelledby="episodes-h" className="min-w-0">
              <h2 id="episodes-h" className="bill-title text-bill-sm text-ink">
                Episodes
              </h2>
              <UnownedEpisodes kind={detail.kind} episodes={detail.episodes} />
            </section>
          ) : null}
        </div>
      </div>

      <TmdbAttribution className="mt-4 px-6 py-3" />
    </>
  );
}

/**
 * The mirror if there is one, the catalogue if there is not — and **no `try` anywhere**.
 *
 * ── Why that matters more than it looks ─────────────────────────────────────────────
 *
 * The obvious shape was to call the throwing mirror read and catch. It is wrong, and
 * `mediasafe/no-empty-catch` said so before a reviewer had to: a catch around that read
 * cannot tell *this title is not mirrored* from *Postgres did not answer*, so a database
 * outage would fall through to TMDB, render the title perfectly, and look completely fine.
 * That is exactly the failure the rules exist to prevent, wearing a different hat —
 * `tvtracker`'s version of it made an unreachable database look like an empty library.
 *
 * So the distinction is made where it can actually be made: `findUnownedTitleDetail`
 * returns `null` for a row that is not there and still throws when the read fails. A
 * missing row is a value; a failure reaches the boundary. Nothing here catches anything.
 *
 * `titleId: null` is the only difference the caller sees, and it is a field rather than a
 * flag on purpose — the one thing a mirrored title can do that an unmirrored one cannot is
 * be added to a list, and that needs exactly this id. A boolean would have let a caller ask
 * *is it mirrored* and then reach for an id that was not there.
 */
type MirroredDetail = NonNullable<Awaited<ReturnType<typeof cachedFindUnownedTitleDetail>>>;

async function catalogueDetail(
  userId: Awaited<ReturnType<typeof requireUserId>>,
  kind: TitleKind,
  tmdbId: number,
): Promise<Omit<MirroredDetail, "titleId"> & { titleId: string | null }> {
  const mirrored = await cachedFindUnownedTitleDetail(userId, kind, tmdbId);
  if (mirrored !== null) return mirrored;

  const summary = await catalogueSummary(kind, tmdbId);

  return {
    titleId: null,
    kind: summary.kind,
    tmdbId: summary.tmdbId,
    name: summary.name,
    releaseYear: summary.releaseYear,
    posterPath: summary.posterPath,
    runtimeMins: summary.runtimeMins,
    /**
     * Empty because an unmirrored title genuinely has no episode list here, not because
     * anything failed. `catalogueSummary` deliberately does not spend a TMDB request per
     * season on a glance, and `UnownedEpisodes` (issue #148) is inert anyway — what the
     * screen loses is a list you cannot press.
     */
    episodes: [],
  };
}
