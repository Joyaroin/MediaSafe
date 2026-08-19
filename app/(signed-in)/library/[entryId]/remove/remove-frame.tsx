import Link from "next/link";

/**
 * The two pieces the confirmation and its failure boundary both render — issue #142.
 *
 * `settings/delete-account/delete-account-frame.tsx` is the precedent and carries the
 * argument for why this is a module rather than two pastes: written out twice, the two
 * drift, and the one that drifts is the failure surface — the render nobody looks at until
 * the day it matters.
 *
 * Neither is a new treatment. The heading is `bill-title` at `text-bill-lg`, the step
 * `DESIGN.md`'s type table gives full-surface headlines. The link is the quiet underline
 * `errors/reference-line.tsx` already sets, rather than a second button competing with the
 * remove for the reader's eye.
 */

/**
 * **It does not name the title, and that is deliberate.** The failure boundary renders this
 * heading too, and on that render the name is precisely the thing that could not be read —
 * a heading that named a title there would either be blank or, worse, be filled in from
 * somewhere other than the read that failed. The name belongs to the page's own body, next
 * to the numbers it was read with, in one statement.
 */
export function RemoveTitleHeading() {
  return <h1 className="bill-title text-bill-lg text-text">Remove from library</h1>;
}

/**
 * The way out, and it is deliberately plain type — the same reasoning `BackToSettings`
 * gives: leaving this page does nothing, so leaving is what it does by default, and giving
 * the exit equal weight to the removal would make the screen read as a choice between two
 * actions rather than as one action a reader has to take.
 *
 * ── Why the library, and not the title the reader came from ──────────────────────────
 *
 * `/library/{entryId}` was the first draft and is wrong on desktop: that route's own
 * docblock calls it *title detail, on the phone — a route you push and pop*, and the desktop
 * reader pressed the control on the pane, which never navigates. Backing out would have
 * dropped them on a layout they otherwise never reach, on the one path whose whole point is
 * that changing your mind costs nothing.
 *
 * `router.back()` would be exactly right on both — the pane leaves the URL at `/library`,
 * the phone leaves it at the title — and is not used, because it answers nothing on a cold
 * load of this URL and a way out that sometimes goes nowhere is worse on this page than on
 * any other.
 *
 * So: `/library`, deterministic, correct on both devices, and the same place a *successful*
 * removal lands (`remove-title-form.tsx`) — confirming and cancelling leave the reader in
 * one place rather than two. The phone reader loses the title they were reading; their back
 * press still has it.
 *
 * It takes no props, and that is the point: the failure boundary renders this too, and a
 * target derived from the route's own segment would be one more thing for that render to
 * get wrong on the day the read has already failed.
 */
export function BackToLibrary() {
  return (
    <p className="mt-8 text-item text-dim">
      <Link
        href="/library"
        className="underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-text"
      >
        ‹ Back to your library
      </Link>
    </p>
  );
}
