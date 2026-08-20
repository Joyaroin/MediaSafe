import type { UpNextRails } from "@/db/access";
import { UpNextEmpty } from "./up-next-empty";
import { UpNextRail } from "./up-next-rail";

/**
 * The desktop Up next surface — issue #137's three rails, in this order.
 *
 * | Rail | What is on it |
 * |---|---|
 * | **Ongoing** | what you are actually in the middle of |
 * | **Coming back** | caught up, and dated to return |
 * | **Old friends** | watching, and cold |
 *
 * The rules are `db/access.ts`'s `listUpNextRails`, and they are there rather than here on
 * purpose: this file decides the words and the order they read in, and knows nothing about
 * what put a title on one rail rather than another.
 *
 * ── The dim line beside each head, and the one word taken out of it ───────────────────
 *
 * `design/catalogue-wall.html` puts a dim rule-of-the-rail beside each head, and it is kept
 * — it is the prototype's appearance, and the label alone is what has to *"need no
 * explanation"*, not the whole head. One word is dropped: the prototype's ONGOING line reads
 * *"watching · your 12 most recent"*, and the numeral goes, because #137 forbids **counts**
 * *"not on a rail head, not on a tile, not on the page"* and a twelve on a rail head reads
 * as one whether it is meant as one or not. *Your most recent* says the same rule without
 * the number; how many is `db/access.ts`'s constant and nobody else's business.
 *
 * The other two lines are the prototype's verbatim. Neither contains a numeral, and neither
 * is a count of anything.
 *
 * ── Server component, and there is nothing to hydrate here ───────────────────────────
 *
 * No `"use client"`: the labels and the order are static, so they are rendered once on the
 * server and the client bundle gets only `UpNextRail`, which needs a ref and two pieces of
 * scroll state, and `UpNextTile`, which needs the selection. The split is
 * `library-grid.tsx`/`selectable-entry.tsx`'s, for the same reason.
 *
 * ── An empty rail, and every rail empty ───────────────────────────────────────────────
 *
 * `UpNextRail` renders nothing for a rail with no members — no heading over nothing. **Every
 * rail empty is a different fact**, and the answer to it is here rather than on `page.tsx`
 * because this component is the one that has all three: a library with nothing watching and
 * nothing dated to return reads as *you're caught up*, in `UpNextEmpty`'s own voice, which is
 * a sentence and not three absences. Both branches are reachable only from a read that
 * succeeded — a failure throws past this into the route's `error.tsx`.
 *
 * ── Hidden below `lg` ─────────────────────────────────────────────────────────────────
 *
 * `page.tsx` gates this, not this file — the phone's five vertical groups are issue #138's,
 * and until they land the phone keeps the deck it already had. A rail read as a single
 * cramped column is not a smaller rail, it is a different surface.
 */
export function UpNextRailsSurface({ rails }: { rails: UpNextRails }) {
  if (
    rails.ongoing.length === 0 &&
    rails.comingBack.length === 0 &&
    rails.oldFriends.length === 0
  ) {
    return <UpNextEmpty />;
  }

  return (
    <div className="pt-5">
      <UpNextRail
        label="Ongoing"
        rule="Watching · your most recent"
        entries={rails.ongoing}
      />
      <UpNextRail
        label="Coming back"
        rule="Caught up · an episode is dated"
        entries={rails.comingBack}
      />
      <UpNextRail
        label="Old friends"
        rule="Watching · everything else"
        entries={rails.oldFriends}
      />
    </div>
  );
}
