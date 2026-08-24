import type { ReactNode } from "react";

import { EpisodeModal } from "../../../../episode-modal";

/**
 * The intercepted route's frame — the dialog, drawn once for all three of its renders.
 *
 * ── How the folder name works, since nothing else in this codebase does this ─────────
 *
 * `(.)` is *intercept a segment at the same level*
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md`).
 * The level is counted in **route segments**, and neither `@modal` nor `(signed-in)` is
 * one — a slot and a route group both contribute nothing to the URL. So this directory
 * sits at the same level as `app/(signed-in)/library`, and `(.)library/…` reaches it. It is
 * two directories further down the file system than the route it intercepts and zero
 * segments away from it; the framework's guide names that trap explicitly, and it is the
 * single easiest thing to get wrong here.
 *
 * ── Why the dialog is a layout and not a line in `page.tsx` ─────────────────────────
 *
 * The same reason the full page's own `layout.tsx` holds its back bar, and the reason is
 * sharper here. Next wraps a segment's `page`, its `loading` **and** its `error` in that
 * segment's layout. Put `EpisodeModal` in `page.tsx` instead and the modal exists only on
 * the render that succeeded: a read still in flight would show nothing at all until it
 * landed, and a read that failed would take the dialog off the screen and drop a bare
 * failure into the layout's flow — under the tab bar, with no backdrop, with no way out,
 * on a page the reader had not left.
 *
 * As a layout, the dialog is on screen the moment the slot matches, and `loading.tsx` and
 * `error.tsx` beside it render *inside* it. Three renders, one dialog, one Escape.
 *
 * ── It reads nothing ────────────────────────────────────────────────────────────────
 *
 * No session, no database, no `params`. A layout that read anything would be a read
 * outside the `Suspense` its own `loading.tsx` provides, and the dialog would arrive no
 * earlier than the episode it is meant to be standing in for — which is the whole failure
 * described above, reached the slow way.
 */
export default function InterceptedEpisodeLayout({ children }: { children: ReactNode }) {
  return <EpisodeModal>{children}</EpisodeModal>;
}
