import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

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
 * uses. Issue #195 moved the link off the quiet underline `errors/reference-line.tsx` set —
 * it is `GHOST_RECOVERY` now, the register the whole underline conversion reuses.
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
    <div className="mt-8">
      <Link href="/settings" className={GHOST_RECOVERY}>
        ‹ Back to Settings
      </Link>
    </div>
  );
}
