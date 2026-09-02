import { BackBar } from "@/app/(signed-in)/back-bar";
import { PendingLine } from "@/app/pending-line";
import { PendingTitlePoster } from "./pending-poster";

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
 * ── The poster is mounted here now, and this reverses what this file said before #303 ──
 *
 * This used to read: *"The poster is not mounted here, and that is the one place this
 * differs from the desktop pane... nothing has been handed to this segment, so there is no
 * poster path in hand."* Nothing was, because both entry paths into a title minted no
 * source name and this segment carried no destination for one — the morph was skipped on
 * both halves. Issue #303 supplies both: the library grid and the Up next row now carry
 * the poster path they already hold across the route change
 * (`app/poster-handoff-memory.ts`), and `pending-poster.tsx` reads it back here, under the
 * same `rail-poster-{id}` name the loaded hero (`title-hero.tsx`) uses — the same pairing
 * `programme-note.tsx`'s own pending frame has always given the desktop pane, which is
 * what stops the two devices disagreeing.
 *
 * `carriedPosterFor` answers `null` for a cold render — a refresh, a bookmark, a direct
 * link — and `<Poster posterPath={null}>` is the quiet rectangle it has always drawn for a
 * title with no artwork, not a placeholder: rendering it un-named would be exactly §9's
 * second reason against a skeleton, and rendering it under the real name the moment one is
 * in hand is what the acceptance criterion asks for instead — a title with no artwork is
 * still distinguishable from one still loading, because both eventually show the identical
 * poster the loaded page will.
 */
export default function TitleDetailLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <BackBar />

      <div className="px-6 py-5">
        <div className="flex items-start gap-4">
          {/* Unheld, deliberately — the acceptance criterion is that the poster is visible
              while the rest of the surface is still being read, so it does not wait behind
              `--dur-pending-hold` the way the bars beside it do (#301). */}
          <PendingTitlePoster />

          <div className="min-w-0 flex-1">
            <PendingLine shape="detail" held />
          </div>
        </div>
      </div>
    </main>
  );
}
