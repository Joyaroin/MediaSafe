import type { ReactNode } from "react";

import type { LibraryStateGroupEntry, UpNextRails } from "@/db/access";
import { UpNextEpisodeRail } from "./up-next-episode-rail";
import { UpNextFilmRail } from "./up-next-film-rail";
import { UpNextNothing } from "./up-next-nothing";

/**
 * The Watching half of Up next, on every screen size.
 *
 * | Rail | What is on it |
 * |---|---|
 * | **Continue watching** | ongoing, then old friends — one rail |
 * | **Films to watch** | the released films standing at Watchlist — unreleased ones are on Coming up |
 *
 * ── One empty state here, and it is not the rails' own ──────────────────────────────
 *
 * Each rail answers its own emptiness by rendering nothing — no heading, no sentence, no
 * reserved space. **Both empty at once is a different fact**, and the answer to it is here
 * rather than on `page.tsx` because this component is the one holding both. See
 * `up-next-nothing.tsx` for why that sentence is not `UpNextEmpty`'s.
 *
 * The check below is the **server's** answer, taken from the two reads, and it deliberately
 * does not re-ask the client-side question the episode rail asks of the marks store. It
 * counts #272's pending titles as episodes, which they are about to be: a reader whose only
 * title is one still mirroring has a rail with a card on it, not *nothing queued for
 * tonight*, and that sentence is the one thing this surface must never say by mistake. A
 * library marked empty card by card between two loads keeps an absent rail and no sentence
 * until the next load: a stale empty state rather than a wrong one, and the alternative is
 * the phrase that must never stand in for a failed read having a second author
 * (`up-next-mark.ts` states this at length).
 *
 * Both branches are reachable only from reads that succeeded. A failure throws past this
 * into the route's `error.tsx`.

 */
export function UpNextWatching({
  rails,
  films,
  suggestions,
}: {
  rails: UpNextRails;
  films: readonly LibraryStateGroupEntry[];
  /** Issue #365's rail, drawn only under the empty state. */
  suggestions: ReactNode;
}) {
  const noEpisodes = rails.ongoing.length === 0 && rails.oldFriends.length === 0;

  if (noEpisodes && films.length === 0) return <UpNextNothing suggestions={suggestions} />;

  return (
    <div className="pb-2">
      <UpNextEpisodeRail rails={rails} />
      <UpNextFilmRail films={films} />
    </div>
  );
}
