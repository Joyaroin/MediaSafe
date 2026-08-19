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
  return <h1 className="bill-title text-bill-lg text-stock">Remove from library</h1>;
}

/**
 * The way out, and it is deliberately plain type — the same reasoning `BackToSettings`
 * gives: leaving this page does nothing, so leaving is what it does by default, and giving
 * the exit equal weight to the removal would make the screen read as a choice between two
 * actions rather than as one action a reader has to take.
 *
 * `/library/{entryId}` is the target on both devices, and on desktop that is the route
 * rendering of title detail rather than the pane the reader pressed the control on. It is
 * the same content and an already-reachable route, so nothing is broken by it; the
 * alternative is a third copy of `selectable-entry.tsx`'s breakpoint constant — a value that
 * file already calls out as one silent duplicate too many — spent on a cancel path.
 *
 * `entryId` is optional because the failure boundary may not have one — `useParams()` can
 * answer `undefined` for a segment, and a link built from `undefined` would point at
 * `/library/undefined`. The library is the honest fallback: it is where the title is, and
 * on the branch where the read failed it is also the only surface that can say whether the
 * title is still there.
 */
export function BackToTitle({ entryId }: { entryId?: string }) {
  return (
    <p className="mt-8 text-item text-stock-dim">
      <Link
        href={entryId === undefined ? "/library" : `/library/${entryId}`}
        className="underline decoration-rule-bold underline-offset-4 transition-colors duration-150 hover:text-stock"
      >
        {entryId === undefined ? "‹ Back to your library" : "‹ Back to the title"}
      </Link>
    </p>
  );
}
