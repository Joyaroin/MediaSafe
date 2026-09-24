import Link from "next/link";

import { DESTRUCTIVE_BUTTON_COMPACT } from "@/app/buttons";

/**
 * The way a title leaves your library — issue #142 — at the foot of its page since #357.
 *
 * **Title detail, and nowhere else.** Never a tile, a rail, a grid cell or a swipe: an
 * action that destroys years of watches must never sit under a gesture somebody makes while
 * scrolling. `tests/remove-from-library-control.test.ts` walks every importer under `app/`
 * to hold that.
 *
 * **It navigates, and the navigation is the ceremony.** A `Link`, not a button — nothing
 * is written from here. The press leads to `titles/[entryId]/remove`, which reads the real
 * watch count and asks, so a mis-tap costs a navigation and nothing else.
 *
 * **At the foot, styled as destructive.** It used to sit directly under the head, above
 * the episodes, in the same outlined pill as *Add to list*; now it is the last thing on
 * the page and the only red one, so it cannot be hit while reaching for an episode.
 */
export function RemoveControl({
  libraryEntryId,
  titleName,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link
        href={`/titles/${libraryEntryId}/remove`}
        aria-label={`Remove ${titleName} from your library`}
        className={DESTRUCTIVE_BUTTON_COMPACT}
      >
        Remove from library
      </Link>
      <p className="text-meta text-dim">Your watches go with it. Nothing brings them back.</p>
    </div>
  );
}
