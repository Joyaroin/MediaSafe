import Link from "next/link";

/**
 * The two pieces the page and its failure boundary both render — issue #125.
 *
 * `app/(signed-in)/library/library-heading.tsx` is the precedent and the reason this is a
 * module rather than two pastes: `library/error.tsx` imports the library's heading so that
 * a failed read still says which surface failed, and this segment has exactly that shape.
 * Written out twice, the two would drift, and the one that drifts is the failure surface —
 * the render nobody looks at until the day it matters.
 *
 * Neither of these is a new treatment. The heading is `bill-title` at `text-bill-lg`, the
 * step `DESIGN.md`'s type table gives full-surface headlines and the same one `/settings`
 * uses. The link is the quiet underline `errors/reference-line.tsx` already sets — `1px`
 * `hair` decoration at a `4px` offset, brightening to `text` on hover — rather than a
 * second ghost button competing with the delete for the reader's eye.
 */

export function DeleteAccountHeading() {
  return <h1 className="bill-title text-bill-lg text-text">Delete account</h1>;
}

/**
 * The way out of the way out, and it is deliberately plain type.
 *
 * *Leaving does nothing* is the property (issue #125), so leaving is what this page does by
 * default — and giving the exit equal weight to the delete would make the screen read as a
 * choice between two actions rather than as one action a reader has to arm.
 */
export function BackToSettings() {
  return (
    <p className="mt-8 text-item text-dim">
      <Link
        href="/settings"
        className="underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-text"
      >
        ‹ Back to Settings
      </Link>
    </p>
  );
}
