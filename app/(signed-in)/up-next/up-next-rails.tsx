import type { LibraryStateGroupEntry, UpNextRails } from "@/db/access";
import { UpNextEpisodeRail } from "./up-next-episode-rail";
import { UpNextFilmRail } from "./up-next-film-rail";
import { UpNextNothing } from "./up-next-nothing";

/**
 * The phone's Up next surface — issue #250's two rails, in this order.
 *
 * | Rail | What is on it |
 * |---|---|
 * | **Next episodes** | ongoing, then coming back, then old friends — one rail |
 * | **Films to watch** | the films standing at Watchlist |
 *
 * This replaces #138's five vertical groups, which are deleted along with
 * their five expanded routes and the title sheet that had no other caller. The two states
 * those groups showed and these rails do not — watchlist shows, and abandoned — stay
 * reachable through the library's status filters, which already carry all five.
 *
 * `up-next-rails-surface.tsx` is this file's desktop opposite number and is **unchanged**:
 * the desktop still draws the three orderings as three rails of posters. #250 is a phone
 * ticket, and a rail of 262px landscape cards read at desktop width is not the same
 * surface — the same argument #138 made in the other direction when it gave the phone a
 * form of its own.
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
 *
 * ── Hidden above `lg` ───────────────────────────────────────────────────────────────
 *
 * `page.tsx` gates this, not this file.
 */
export function UpNextPhoneRails({
  rails,
  films,
}: {
  rails: UpNextRails;
  films: readonly LibraryStateGroupEntry[];
}) {
  const noEpisodes =
    rails.ongoing.length === 0 &&
    rails.comingBack.length === 0 &&
    rails.oldFriends.length === 0;

  if (noEpisodes && films.length === 0) return <UpNextNothing />;

  return (
    <div className="pb-2">
      <UpNextEpisodeRail rails={rails} />
      <UpNextFilmRail films={films} />
    </div>
  );
}
