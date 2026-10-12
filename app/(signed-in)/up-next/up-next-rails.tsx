import type { ReactNode } from "react";

import type { LibraryStateGroupEntry, UpNextRails } from "@/db/access";
import { TonightSurface } from "./tonight-surface";
import { UpNextHeading } from "./up-next-heading";
import { UpNextNothing } from "./up-next-nothing";

/**
 * Tonight, on every screen size: the empty state, or the surface.
 *
 * ── One empty state here, and it is the server's answer ──────────────────────────────
 *
 * **No episode and no film at all** is a different fact from a list that has been marked
 * empty card by card, and the answer to it is here rather than on `page.tsx` because this
 * component is the one holding both reads. See `up-next-nothing.tsx` for the sentence.
 *
 * The check below is the **server's** answer, taken from the two reads, and it deliberately
 * does not re-ask the client-side question the list asks of the marks store. It counts
 * #272's pending titles as episodes, which they are about to be: a reader whose only title
 * is one still mirroring has a row on the list, not *nothing queued for tonight*, and that
 * sentence is the one thing this surface must never say by mistake. A library marked empty
 * between two loads keeps an absent list and no sentence until the next load: a stale empty
 * state rather than a wrong one, and the alternative is the phrase that must never stand in
 * for a failed read having a second author (`up-next-mark.ts` states this at length).
 *
 * Both branches are reachable only from reads that succeeded. A failure throws past this
 * into the route's `error.tsx`.
 */
export function UpNextWatching({
  rails,
  films,
  comingUp,
  suggestions,
}: {
  rails: UpNextRails;
  films: readonly LibraryStateGroupEntry[];
  /** Coming up's next three rows, for the desktop's right column. */
  comingUp: ReactNode;
  /** Issue #365's rail, drawn only under the empty state. */
  suggestions: ReactNode;
}) {
  const noEpisodes = rails.ongoing.length === 0 && rails.oldFriends.length === 0;

  if (noEpisodes && films.length === 0) {
    return (
      <div className="pb-8 lg:px-10 lg:pt-8">
        <div className="px-gutter pt-5 lg:px-0 lg:pt-0">
          <UpNextHeading />
        </div>
        <UpNextNothing suggestions={suggestions} />
      </div>
    );
  }

  return <TonightSurface rails={rails} films={films} comingUp={comingUp} />;
}
