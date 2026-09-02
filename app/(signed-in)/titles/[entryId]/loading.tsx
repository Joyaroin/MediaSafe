import { BackBar } from "@/app/(signed-in)/back-bar";
import { PendingLine } from "@/app/pending-line";

/**
 * Title detail, still reading — the phone route.
 *
 * ── This file exists because a boundary above it would speak for it ─────────────────
 *
 * A `loading.tsx` wraps its own segment **and every segment below it**. Without this file,
 * `app/(signed-in)/library/loading.tsx` is what a reader tapping a tile would see, and it
 * would paint *The library* over a title's own page — a heading that names the wrong
 * surface, which is the failure mode `DESIGN.md` §9 is built to prevent rather than a
 * cosmetic slip. The boundary belongs to the segment whose content is pending, so the
 * segment gets one.
 *
 * ── The formula, on a route whose heading is itself the answer ───────────────────────
 *
 * §9: *`loading.tsx` renders what the segment's `error.tsx` already renders, less the
 * failure* — and where the `<h1>` is `{detail.name}`, what `error.tsx` renders above the
 * failure is the back link and **no `<h1>` at all**, because the name is exactly the thing
 * being waited for. `(signed-in)/back-bar.tsx` is that bar, shared by all three renders of
 * this route and by the episode route's three as well — and since #292 it names the surface
 * the reader arrived from, so the pending render offers the same way out as the loaded one
 * rather than a link to a grid.
 *
 * The poster is not mounted here, and that is the one place this differs from the desktop
 * pane. `programme-note.tsx`'s loading frame shows one because `selectedPosterPath` is a
 * fact the tile it was pressed from already held, and because the frame is the first half of
 * the `rail-poster-{id}` morph (§8). Neither is true on a cold route render: nothing has been
 * handed to this segment, so there is no poster path in hand and nothing to render at full
 * strength. Rendering a placeholder in its place is exactly §9's second reason for having no
 * skeleton — a `raised` rectangle at `2/3` is pixel-identical to a title TMDB has no artwork
 * for.
 */
export default function TitleDetailLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <BackBar />

      <div className="px-6 py-5">
        <PendingLine shape="detail" held />
      </div>
    </main>
  );
}
