import { redirect } from "next/navigation";

import { AddToListControl } from "@/app/(signed-in)/library/add-to-list-control";
import { LiveTitleFactsStreamed } from "@/app/(signed-in)/library/live-title-facts-streamed";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { BackToListsBar } from "@/app/(signed-in)/lists/back-to-lists-bar";
import { Poster } from "@/app/poster";
import { TmdbAttribution } from "@/app/tmdb-attribution";
import { cachedUnownedTitleDetail } from "@/cache/borrowed-facts";
import { libraryEntryIdForTitle } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { catalogueKeyFrom } from "@/tmdb/mirror";
import { AddToLibraryControl } from "./add-to-library-control";
import { UnownedEpisodes } from "./unowned-episodes";

/**
 * Title detail for a title you do not own — issue #148, and the destination a list row
 * has been missing since issue #147 built the list page. A list holds anything in the
 * catalogue, so tapping a listed title you have not added has to reach something; without
 * this route it reached nothing, and a list was a wall of dead posters.
 *
 * ── The same page, adapting ───────────────────────────────────────────────────────────
 *
 * The borrowed half is unchanged — poster, meta line, synopsis, providers, cast, episodes
 * and TMDB's attribution — because it is the same borrowed half, read from the same
 * global tables and rendered by the same components (`LiveTitleFactsStreamed`, and the
 * shared shaping in `library/season-grouping.ts` and `library/title-meta-line.ts`). What is
 * absent is everything that would be an answer about *you*: no state line, no progress, no
 * up-next marking, no rating control, no abandon, no remove, no unwatch. Nothing here can
 * tell you something false about a show you have never watched, because nothing here has
 * a field to say it with — `UnownedTitleDetailRow` carries no owned fact at all.
 *
 * What is present is *Add to library* and, since issue #222, *Add — watched* beside it —
 * and afterwards the title behaves like everything else. There are not two kinds of show.
 * The second control is not an exception to the paragraph above: it says nothing about
 * what this reader has watched, it records what they say they have.
 *
 * ── Keyed by `(kind, tmdbId)`, not by a library entry ─────────────────────────────────
 *
 * The route's own segments are the key of the read: `title_kind_tmdb_id_key`, because
 * TMDB numbers films and shows separately. `getTitleDetail`'s route (`library/[entryId]`)
 * is keyed by the owned row and throws for a missing or foreign id, and this ticket
 * leaves that exactly as it was — `db/access.ts`'s `getUnownedTitleDetail` says at length
 * why a second read is the safe shape and an owned read that tolerates a missing owner is
 * not.
 *
 * ── An account that owns the title is sent to its own copy ────────────────────────────
 *
 * Nothing links here for a title you have — `list-title-row.tsx` links an owned row
 * straight to `library/[entryId]` — but a URL can be typed, kept in a tab, or followed
 * after the add that happened in another one. Rendering this page for a title you own
 * would be the second kind of show: a page offering to add what you have, with your
 * progress conspicuously missing from it. So ownership is asked first, and the answer,
 * when there is one, is a redirect rather than a different render.
 *
 * ── A page read, unguarded ────────────────────────────────────────────────────────────
 *
 * Both mirrored reads (`libraryEntryIdForTitle`, `cachedUnownedTitleDetail`) are called
 * directly with no `try`: a failure throws into `error.tsx` beside this file, which is
 * `AGENTS.md`'s error discipline — a database MediaSafe cannot reach must never render as
 * a title with no episodes. `library/[entryId]/page.tsx` is the same shape, and its
 * docblock carries why the desktop pane cannot be.
 *
 * The cache does not change that, and this is the page where it would be tempting to
 * think it does. `unstable_cache` stores a resolved value only, so a throw from
 * `getUnownedTitleDetail` — a database that is down, or a `title` row that is genuinely
 * not mirrored — travels out through `cachedUnownedTitleDetail` untouched and leaves
 * nothing behind (`cache/borrowed-facts.ts`).
 *
 * ── The mirrored read is cached; the ownership question is not (issue #225) ──────────
 *
 * `cachedUnownedTitleDetail` is a **borrowed** fact: `title` and `episode` are global,
 * they say what TMDB last said, and a nightly sweep or anybody's add is what changes them
 * — so it carries a title-scoped tag and a window, and the sweep busts it.
 * `libraryEntryIdForTitle` above it is the opposite kind of question — *do you own this?*
 * — and it stays uncached deliberately: it is an owned fact, its ticket is #226, and a
 * stale answer here is not a stale poster but this page rendering *Add to library* for a
 * title the reader added in another tab.
 *
 * ── The three live facts stream in behind this render (issue #218) ───────────────────
 *
 * `<LiveTitleFactsStreamed>` is a Server Component, built and rendered right where it
 * appears below — this page never awaits it, so nothing here gates the page's own shell
 * on TMDB. `library/[entryId]/page.tsx`'s docblock carries the fuller reasoning; it is the
 * same component either way.
 */
export const dynamic = "force-dynamic";

export default async function UnownedTitlePage({
  params,
}: {
  params: Promise<{ kind: string; tmdbId: string }>;
}) {
  /**
   * A URL is whatever somebody typed, and both segments reach the database — `kind`
   * against `title_kind_check`, `tmdbId` against an `integer` column. `catalogueKeyFrom`
   * is the one predicate the two adds use as well, so a route and the action it leads to
   * cannot disagree about what a catalogue key is.
   *
   * A throw lands in this route's own `error.tsx`, the same place a failed read would:
   * the page did not load. Not `notFound()`, because there is no fifth error treatment in
   * this application (`AGENTS.md` names four, by blast radius) and a hand-edited URL on a
   * signed-in-only route is not a class of visitor worth minting one for —
   * `getListDetail` already answers a made-up list id exactly this way.
   */
  const segments = await params;
  const { kind, tmdbId } = catalogueKeyFrom(segments.kind, segments.tmdbId);
  const userId = await requireUserId();

  const owned = await libraryEntryIdForTitle(userId, kind, tmdbId);
  if (owned !== null) redirect(`/library/${owned}`);

  const detail = await cachedUnownedTitleDetail(userId, kind, tmdbId);
  const meta = titleMetaLine(detail);

  return (
    <main className="flex w-full flex-1 flex-col">
      {/* Back to Lists, because a list is the only thing that links here. It is a
          destination rather than a history pop for the reason `library/[entryId]`'s own
          back link is: a link still works on a tab opened cold, where nothing has been
          popped from yet. */}
      <BackToListsBar />

      <div className="px-6 py-5">
        {/* `382` is `programme-note-content.tsx`'s number, taken deliberately rather than
            re-derived: the borrowed half of this page is the same borrowed half, and a
            poster served at a different size on one of the two title pages would be the
            first place they stopped being that.

            Said plainly, because the number's own reasoning does not fully transfer: `382`
            was chosen for the desktop pane (`420px` minus `px-6`) and a large phone
            viewport, and this page has no pane — on desktop it fills the shell's column,
            which is wider than either. That is not new here. The owned phone route is
            reachable on desktop by exactly the same list rows and renders exactly the same
            `w-full` poster, so both title pages share the behaviour and issue #141's
            poster morph is what owns changing it. Every width in play still lands in
            TMDB's `w500` bucket (`app/poster.tsx`), so nothing served differs meanwhile. */}
        {/* This page's one hero poster, always the visible artwork on it — the same
            reasoning `programme-note-content.tsx` gives for its own (`app/poster.tsx`). */}
        <Poster posterPath={detail.posterPath} width={382} className="w-full" aboveFold />

        {/* An `h1` where the owned page's shared content renders an `h2`: that component
            is also the desktop pane, which sits inside the library screen and under its
            heading. This is a page about one title and nothing else, so the title is its
            heading. */}
        <h1 className="bill-title mt-5 text-bill-xl">{detail.name}</h1>

        {meta === null ? null : (
          <p className="code-line mt-3 text-dim" data-numeric>
            {meta}
          </p>
        )}

        {/* Where the owned page puts its state line — the line that says where this title
            stands with you. It stands nowhere with you yet, and these are the controls
            that change that, so they take the slot rather than sitting at the foot of a
            page you would have to scroll to reach. */}
        {/* Keyed on the same argument as the control below it, and inert for the same
            reason — with one more: the success path unmounts this by navigating away, so
            only a *failed* add leaves state (a standing toast's handle) that a reconciled
            remount could carry onto another title. */}
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

        {/* Issue #147's own acceptance criterion: *title detail offers Add to list, on an
            owned title and an untracked one alike*. It was only reachable on the owned
            page until this one existed, and it is keyed by `titleId` because a list holds
            titles, not library entries.

            `key`, as on the owned page — and belt-and-braces here, said outright: nothing
            links one unowned title's page to another today, so there is no navigation for
            it to catch. It costs one line, and it means the two callers of this control
            agree rather than one of them relying on a topology property to be safe, which
            is the trade `title-detail-view.tsx` already makes for its own entry-id guard.
            The property it would rely on is not free either: two titles' pages are the
            same route segment in the same tree position, so React reconciles one onto the
            other rather than remounting, and an open dialog and its fetched rows would
            carry over to a title they are not about. */}
        <AddToListControl
          key={detail.titleId}
          titleId={detail.titleId}
          titleName={detail.name}
        />

        <UnownedEpisodes kind={detail.kind} episodes={detail.episodes} />
      </div>

      {/* Always on screen, as on the owned phone route: this page only renders once the
          mirrored read has succeeded, so borrowed data is on screen the moment there is a
          page to attribute it on. */}
      <TmdbAttribution className="mt-4 px-6 py-3" />
    </main>
  );
}

