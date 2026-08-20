import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

/**
 * The one piece this route's three renders all have above the fold — issue #180.
 *
 * `page.tsx` and `error.tsx` were already drawing this bar twice, character for character.
 * `loading.tsx` would have been the third paste, and `remove-frame.tsx`'s docblock carries
 * the argument against that in as many words: *written out twice, the two drift, and the one
 * that drifts is the failure surface — the render nobody looks at until the day it matters.*
 * A pending render is a second such surface, so the bar moves here before there are three.
 *
 * ── It is the whole heading of the pending and failed renders ────────────────────────
 *
 * `DESIGN.md` §9 spells out what *the page's own heading component* means for a route whose
 * `<h1>` is itself the answer: **whatever the segment's `error.tsx` renders above the
 * failure**, which here is this bar and no `<h1>` at all. That is not a shortcut. This
 * route's heading is `{detail.name}`, read from the database, so a name that has not arrived
 * cannot be printed and a name that failed to load must not be — the alternative is a
 * heading filled in from somewhere other than the read it belongs to.
 *
 * The link stays on screen through both: a route that is slow to load and a route that
 * failed to load are both routes a reader should be able to leave, and `/library` is where
 * every path into this one starts from.
 */
export function BackToLibraryBar() {
  return (
    <div className="border-b border-hair px-6 py-4">
      {/* Issue #195: GHOST_RECOVERY, not the old dim underline — the register the whole
          underline conversion reuses. */}
      <Link href="/library" className={GHOST_RECOVERY}>
        ‹ Library
      </Link>
    </div>
  );
}
