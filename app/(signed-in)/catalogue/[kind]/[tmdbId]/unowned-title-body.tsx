import { redirect } from "next/navigation";

import { AddToListControl } from "@/app/(signed-in)/library/add-to-list-control";
import { LiveTitleFactsStreamed } from "@/app/(signed-in)/library/live-title-facts-streamed";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { BackToListsBar } from "@/app/(signed-in)/lists/back-to-lists-bar";
import { Poster } from "@/app/poster";
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
  /**
   * There was an `overlaid` flag here until issue #273 — *rendered inside the intercepting
   * dialog rather than as the page* — and it changed the back bar and nothing else. The
   * interception is deleted, this route has one render, and the back bar is the only way
   * out of it again.
   */
}) {
  const userId = await requireUserId();

  /**
   * You already own this. The route redirects to the library entry, because a screen
   * offering to add what you have is worse than a navigation nobody asked for.
   *
   * It was written when this route had a second, intercepted render and `redirect()` had
   * to work from inside a dialog as well. Issue #273 deleted that render; the redirect is
   * unchanged, because it was never the half that varied.
   */
  const owned = await cachedLibraryEntryIdForTitle(userId, kind, tmdbId);
  if (owned !== null) redirect(`/titles/${owned}`);

  const detail = await catalogueDetail(userId, kind, tmdbId);
  const meta = titleMetaLine(detail);

  return (
    <>
      {/* Back to Lists, because a list is the only thing that links to the *route*. It is
          a destination rather than a history pop for the reason `titles/[entryId]`'s own
          back link is: a link still works on a tab opened cold, where nothing has been
          popped from yet. */}
      <BackToListsBar />

      <div className="px-6 py-5">
        {/* `382` is `programme-note-content.tsx`'s number, taken rather than re-derived:
            the borrowed half of this screen is the same borrowed half, and a poster served
            at a different size on one of the two title screens would be the first place
            they stopped being that. Every width in play lands in TMDB's `w500` bucket
            (`app/poster.tsx`), so nothing served differs meanwhile. */}
        <Poster
          posterPath={detail.posterPath}
          name={detail.name}
          width={382}
          className="w-full"
          aboveFold
        />

        {/* An `h1` where the owned screen's shared content renders an `h2`: that component
            is also the desktop pane, which sits inside the library screen and under its
            heading. This is about one title and nothing else. `text-ink` is #255's — the
            largest heading in the application was the only one drawn at the body colour. */}
        <h1 className="bill-title mt-5 text-bill-xl text-ink">{detail.name}</h1>

        {meta === null ? null : (
          <p className="code-line mt-3 text-dim" data-numeric>
            {meta}
          </p>
        )}

        {/* Where the owned screen puts the line saying where this title stands with you.
            It stands nowhere with you yet, and this is the control that changes that, so
            it takes the slot rather than sitting at the foot of something you would have
            to scroll to reach.

            Keyed, and inert for it: the success path unmounts this by navigating away, so
            only a *failed* add leaves state — a standing toast's handle — that a
            reconciled remount could otherwise carry onto another title. */}
        <AddToLibraryControl
          key={`${detail.kind}:${detail.tmdbId}`}
          kind={detail.kind}
          tmdbId={detail.tmdbId}
          titleName={detail.name}
        />

        <LiveTitleFactsStreamed
          userId={userId}
          kind={detail.kind}
          tmdbId={detail.tmdbId}
        />

        {/* Issue #147's acceptance criterion — *title detail offers Add to list, on an
            owned title and an untracked one alike* — and it is offered exactly as far as
            it can be. A list membership is keyed on a `title` **row**, so a title this
            database has never mirrored has nothing for a membership to point at. Showing
            the control anyway would be offering an action that cannot be taken. */}
        {detail.titleId === null ? null : (
          <AddToListControl
            key={detail.titleId}
            titleId={detail.titleId}
            titleName={detail.name}
          />
        )}

        {/* Empty for an unmirrored title, and `UnownedEpisodes` renders nothing for an
            empty list — see `catalogueDetail` for why the seasons are not fetched. */}
        <UnownedEpisodes kind={detail.kind} episodes={detail.episodes} />
      </div>

      {/* Always on screen: nothing above renders until a read has succeeded, so borrowed
          data is attributed the moment there is anything to attribute. */}
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
 * That is exactly the failure `SPEC.md` §3 exists to prevent, wearing a different hat —
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
