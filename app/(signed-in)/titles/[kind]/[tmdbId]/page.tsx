import Link from "next/link";
import { redirect } from "next/navigation";

import { AddToListControl } from "@/app/(signed-in)/library/add-to-list-control";
import { LiveTitleFacts } from "@/app/(signed-in)/library/live-title-facts";
import { titleMetaLine } from "@/app/(signed-in)/library/title-meta-line";
import { Poster } from "@/app/poster";
import { TmdbAttribution } from "@/app/tmdb-attribution";
import { getUnownedTitleDetail, libraryEntryIdForTitle } from "@/db/access";
import { requireUserId } from "@/lib/session";
import type { TitleKind } from "@/tmdb/mirror";
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
 * global tables and rendered by the same components (`LiveTitleFacts`, and the shared
 * shaping in `library/season-grouping.ts` and `library/title-meta-line.ts`). What is
 * absent is everything that would be an answer about *you*: no state line, no progress, no
 * up-next marking, no rating control, no abandon, no remove, no unwatch. Nothing here can
 * tell you something false about a show you have never watched, because nothing here has
 * a field to say it with — `UnownedTitleDetailRow` carries no owned fact at all.
 *
 * What is present is one *Add to library*, and afterwards the title behaves like
 * everything else. There are not two kinds of show.
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
 * Both reads are called directly with no `try`: a failure throws into `error.tsx` beside
 * this file, which is `AGENTS.md`'s error discipline — a database MediaSafe cannot reach
 * must never render as a title with no episodes. `library/[entryId]/page.tsx` is the same
 * shape, and its docblock carries why the desktop pane cannot be.
 */
export const dynamic = "force-dynamic";

export default async function UnownedTitlePage({
  params,
}: {
  params: Promise<{ kind: string; tmdbId: string }>;
}) {
  const { kind, tmdbId } = titleKeyFrom(await params);
  const userId = await requireUserId();

  const owned = await libraryEntryIdForTitle(userId, kind, tmdbId);
  if (owned !== null) redirect(`/library/${owned}`);

  const detail = await getUnownedTitleDetail(kind, tmdbId);
  const meta = titleMetaLine(detail);

  return (
    <main className="flex w-full flex-1 flex-col">
      {/* Back to Lists, because a list is the only thing that links here. It is a
          destination rather than a history pop for the reason `library/[entryId]`'s own
          back link is: a link still works on a tab opened cold, where nothing has been
          popped from yet. */}
      <div className="border-b border-hair px-6 py-4">
        <Link
          href="/lists"
          className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors hover:text-text"
        >
          ‹ Lists
        </Link>
      </div>

      <div className="px-6 py-5">
        <Poster posterPath={detail.posterPath} width={382} className="w-full" />

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
            stands with you. It stands nowhere with you yet, and this is the one control
            that changes that, so it takes the slot rather than sitting at the foot of a
            page you would have to scroll to reach. */}
        <AddToLibraryControl
          key={`${detail.kind}:${detail.tmdbId}`}
          kind={detail.kind}
          tmdbId={detail.tmdbId}
          titleName={detail.name}
        />

        <LiveTitleFacts kind={detail.kind} tmdbId={detail.tmdbId} />

        {/* Issue #147's own acceptance criterion: *title detail offers Add to list, on an
            owned title and an untracked one alike*. It was only reachable on the owned
            page until this one existed, and it is keyed by `titleId` because a list holds
            titles, not library entries.

            `key`, as on the owned page and for the same reason: two titles' pages are the
            same route segment in the same tree position, so React reconciles one onto the
            other rather than remounting, and this control's open dialog and fetched rows
            would carry over to a title they are not about. */}
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

/**
 * The route's two segments, as the read takes them.
 *
 * A URL is whatever somebody typed, and both of these reach the database — `kind` against
 * a `CHECK` constraint, `tmdbId` against an `integer` column. A throw is the honest
 * treatment and it lands in this route's own `error.tsx`, the same place a failed read
 * would: the page did not load. Not `notFound()`, because there is no fourth error
 * treatment in this application (`AGENTS.md` names four, by blast radius) and a
 * hand-edited URL on a signed-in-only route is not a class of visitor worth minting one
 * for — `getListDetail` already answers a made-up list id exactly this way.
 */
function titleKeyFrom(params: { kind: string; tmdbId: string }): {
  kind: TitleKind;
  tmdbId: number;
} {
  if (params.kind !== "film" && params.kind !== "show") {
    throw new Error(`Title detail asked for kind ${JSON.stringify(params.kind)}.`);
  }

  // `Number` and not `parseInt`: `parseInt("12abc")` is 12, and a URL segment that is not
  // a number should not be read as the number it starts with.
  const tmdbId = Number(params.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw new Error(`Title detail asked for TMDB id ${JSON.stringify(params.tmdbId)}.`);
  }

  return { kind: params.kind, tmdbId };
}
