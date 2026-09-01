import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

/**
 * The one piece this route's three renders all have above the fold — the same job
 * `back-to-library-bar.tsx` does one segment up, and written here for the same reason that
 * file records: `page.tsx`, `error.tsx` and `loading.tsx` would otherwise draw it three
 * times, character for character, and *the one that drifts is the failure surface — the
 * render nobody looks at until the day it matters.*
 *
 * ── It goes to the show, not to the library ─────────────────────────────────────────
 *
 * A reader arrives here from a season list or (issue #254) from a rail card, and both of
 * those are on or under the title. Sending them to `/library` would skip the surface they
 * came from. This is also the fallback that makes the route standalone: on a cold load of
 * a bookmarked episode there is no history to pop, and the show's own page is the answer
 * to *where is this episode from*.
 *
 * **The id comes from a read since issue #289**, not from the URL — the route carries the
 * episode's id alone now. `layout.tsx` holds the argument for making that read there; what
 * is unchanged here is the destination and the label, both of which issue #292 replaces.
 *
 * ── It is the whole heading of the pending and failed renders ───────────────────────
 *
 * `DESIGN.md` §9 on a route whose `<h1>` is itself the answer: the heading is **whatever
 * the segment's `error.tsx` renders above the failure**, which here is this bar and no
 * `<h1>` at all. The episode's name is read from the database, so a name that has not
 * arrived cannot be printed and a name that failed to load must not be.
 *
 * The label says *Show* rather than naming it, and that is the same rule rather than a
 * shortcut: the title's name is on the far side of the same read as the episode's, so a
 * bar that named the show could not be drawn by `loading.tsx` or by `error.tsx` — and a
 * bar drawn by only one of the three renders is the paste this file exists to prevent.
 */
export function BackToTitleBar({ libraryEntryId }: { libraryEntryId: string }) {
  return (
    <div className="border-b border-hair px-6 py-4">
      <Link href={`/library/${libraryEntryId}`} className={GHOST_RECOVERY}>
        ‹ Show
      </Link>
    </div>
  );
}
