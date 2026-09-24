import { PendingLine } from "@/app/pending-line";
import { BackToLibrary, RemoveTitleHeading } from "./remove-frame";

/**
 * The counts are still being read, so there is nothing here to confirm yet.
 *
 * ── What matters most is what is not below ──────────────────────────────────────────
 *
 * `remove/error.tsx` makes the argument for its own render and it is the same one here: *a
 * page that could not count a title's watches must not offer to destroy them, and the way to
 * guarantee that is for the failing render to have no form in it at all rather than for a
 * form to be conditionally hidden.* A page that has **not yet** counted them is the same
 * page. There is no remove button on this file for the same reason there is none on that
 * one, and the guarantee is structural in the same way — the form is not here to be hidden.
 *
 * ── The formula ──────────────────────────────────────────────────────────────────────
 *
 * Radius 1: what the segment's `error.tsx` renders, less the failure. That
 * is `remove-frame.tsx`'s two pieces — the heading, which does not name the title and so is
 * a literal that never waits, and the way back — with one dim line in the gutter the failure
 * would have used. `RemoveTitleHeading`'s docblock already explains why it names no title:
 * the boundary renders it too, and a heading filled in from somewhere other than the read it
 * belongs to is worse than one that says only which page this is.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────────────
 *
 * Without it, `[entryId]/loading.tsx` is the nearest boundary above and this route would show
 * the title-detail bar while it reads: a way out of the *title* over a confirmation page,
 * on a full-width layout this surface does not use. The boundary belongs to the segment
 * whose content is pending.
 */
export default function RemoveTitleLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <RemoveTitleHeading />

      <div className="mt-8">
        <PendingLine shape="form" held />
      </div>

      <BackToLibrary />
    </main>
  );
}
