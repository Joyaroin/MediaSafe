import type { ReactNode } from "react";

import { BackToTitleBar } from "./back-to-title-bar";

/**
 * The episode route's frame — the back bar and the page's `<main>`, drawn once for all
 * three of its renders.
 *
 * ── Why this is a layout and not a line in each of the three files ──────────────────
 *
 * `[entryId]` one segment up solves the same problem with a shared component
 * (`back-to-library-bar.tsx`) that its `page.tsx`, `error.tsx` and `loading.tsx` each
 * render. That works there because the bar it draws is a constant — `/library` needs
 * nothing from the route.
 *
 * This bar does: it points at the owning entry, whose id is in the URL. And **`loading.tsx`
 * is given no `params`** — Next hands those to pages and layouts, not to boundaries — so
 * the pending render is the one file that could not build the link. The first draft of
 * this route worked around that by passing an empty id and producing `/library/`, a link
 * to nowhere on the one render a reader is most likely to be looking at while they wait.
 *
 * A layout is the mechanism the framework already has for this: it receives `params`, it
 * wraps the segment's page **and its boundaries**, so the bar survives both the pending
 * render and the failed one without any of the three knowing it exists. That is the
 * property `back-to-library-bar.tsx` was after — one bar, not three pastes — reached by
 * the means that also answers the id.
 *
 * ── It reads nothing ────────────────────────────────────────────────────────────────
 *
 * No session, no database, no `await` past `params`. That matters: a layout that read
 * anything would be a read outside the `Suspense` its own `loading.tsx` provides, and the
 * bar would arrive no earlier than the page it is meant to be standing in for. The one
 * thing it needs is in the URL.
 *
 * Authorising the entry id is `page.tsx`'s job and stays there, through the read it
 * already makes. Nothing here is shown to a reader that a URL did not already contain.
 */
export default async function EpisodeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  return (
    <main className="flex w-full flex-1 flex-col">
      <BackToTitleBar libraryEntryId={entryId} />
      {children}
    </main>
  );
}
