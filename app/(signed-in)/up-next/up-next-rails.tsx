import type { UpNextRails as Rails } from "@/db/access";
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
 * ── Words that need no explanation, and no subtitle under them ────────────────────────
 *
 * `design/catalogue-wall.html` puts a dim line beside each railhead — *"watching · your 12
 * most recent"*. That line is not carried over, and it is the one place this diff departs
 * from a prototype that is otherwise binding on appearance. Two of #137's own acceptance
 * criteria are why: the rails must be *"labelled in words that need no explanation"*, which
 * a subtitle whose whole job is explanation contradicts, and there must be **no counts**
 * anywhere — *"not on a rail head, not on a tile, not on the page"* — which the numeral in
 * that particular sentence reads as whether it is one or not. The issue wins over the
 * prototype on rules, and the twelve is a rule.
 *
 * ── Server component, and there is nothing to hydrate here ───────────────────────────
 *
 * No `"use client"`: the labels and the order are static, so they are rendered once on the
 * server and the client bundle gets only `UpNextRail`, which needs a ref and two pieces of
 * scroll state, and `UpNextTile`, which needs the selection. The split is
 * `library-grid.tsx`/`selectable-entry.tsx`'s, for the same reason.
 *
 * ── Hidden below `lg` ─────────────────────────────────────────────────────────────────
 *
 * `page.tsx` gates this, not this file — the phone's five vertical groups are issue #138's,
 * and until they land the phone keeps the deck it already had. A rail read as a single
 * cramped column is not a smaller rail, it is a different surface.
 */
export function UpNextRails({ rails }: { rails: Rails }) {
  return (
    <div className="pt-5">
      <UpNextRail label="Ongoing" railId="up-next-rail-ongoing" entries={rails.ongoing} />
      <UpNextRail
        label="Coming back"
        railId="up-next-rail-coming-back"
        entries={rails.comingBack}
      />
      <UpNextRail
        label="Old friends"
        railId="up-next-rail-old-friends"
        entries={rails.oldFriends}
      />
    </div>
  );
}
