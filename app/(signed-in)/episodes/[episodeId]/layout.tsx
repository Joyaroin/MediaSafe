import type { ReactNode } from "react";

import { cachedLibraryEntryIdForEpisode } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { BackToTitleBar } from "./back-to-title-bar";

/**
 * The episode route's frame — the back bar and the page's `<main>`, drawn once for all
 * three of its renders.
 *
 * ── Why this is a layout and not a line in each of the three files ──────────────────
 *
 * `titles/[entryId]` solves the same problem with a shared component
 * (`back-to-library-bar.tsx`) that its `page.tsx`, `error.tsx` and `loading.tsx` each
 * render. That works there because the bar it draws is a constant — `/library` needs
 * nothing from the route.
 *
 * This bar does: it points at the owning entry. And **`loading.tsx` is given no
 * `params`** — Next hands those to pages and layouts, not to boundaries — so the pending
 * render is the one file that could not build the link. The first draft of this route
 * worked around that by passing an empty id and producing a bare `/titles/`, a link to
 * nowhere on the one render a reader is most likely to be looking at while they wait.
 *
 * A layout is the mechanism the framework already has for this: it receives `params`, it
 * wraps the segment's page **and its boundaries**, so the bar survives both the pending
 * render and the failed one without any of the three knowing it exists. That is the
 * property `back-to-library-bar.tsx` was after — one bar, not three pastes — reached by
 * the means that also answers the id.
 *
 * ── It used to read nothing, and issue #289 is what changed that ────────────────────
 *
 * The entry id was in the URL until #289 lifted this route out from under it, and this
 * file's whole argument for itself used to end *the one thing it needs is in the URL*.
 * It is not any more, so the bar's destination costs a read — and the cost is written
 * here rather than discovered:
 *
 * - **It is the same read the page makes**, through the same cache entry
 *   (`cachedLibraryEntryIdForEpisode`), so the two callers are one query. The expensive
 *   read — the title and its whole run — stays inside `Suspense`, where `loading.tsx`
 *   still stands in for it.
 * - **A layout is outside its own segment's boundaries.** A failure here reaches
 *   `app/error.tsx` rather than the `error.tsx` beside this file, and the pending render
 *   waits on it. That is a real widening of one blast radius, taken because the
 *   alternative is a bar that vanishes from the two renders it exists for.
 * - **It is temporary.** Issue #292 relabels this bar from the surface the reader arrived
 *   from and walks history instead of linking to a computed destination, at which point
 *   it needs no id at all and this read goes with it.
 *
 * ── Nothing resolved means no bar ───────────────────────────────────────────────────
 *
 * `null` is an episode this account does not hold, and `page.tsx` answers it with
 * `notFound()`. There is no show behind the address, so there is no *‹ Show* to offer —
 * a bar pointing at `/titles/null` would be the link to nowhere this file was written to
 * prevent. The signed-in shell's masthead, sidebar and tab bar are on screen throughout
 * either way.
 *
 * Authorising the entry is still the read's own: `libraryEntryIdForEpisode` scopes by
 * `ownedBy(userId, libraryEntry)`, so nothing here can name an entry that is not this
 * reader's.
 */
export default async function EpisodeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  const userId = await requireUserId();
  const libraryEntryId = await cachedLibraryEntryIdForEpisode(userId, episodeId);

  return (
    <main className="flex w-full flex-1 flex-col">
      {libraryEntryId === null ? null : (
        <BackToTitleBar libraryEntryId={libraryEntryId} />
      )}
      {children}
    </main>
  );
}
