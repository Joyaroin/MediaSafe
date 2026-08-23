"use client";

import type { OngoingEntry } from "@/db/access";
import { FIRST_RUN, GroupSection, TILE } from "./home-group";
import { OngoingTile } from "./ongoing-tile";
import { useMarkableEntries } from "./up-next-mark";

/**
 * The Ongoing group — issue #220, and the one group of the five that is a client
 * component.
 *
 * It is `HomeGroup` with two differences and no third:
 *
 * - its tiles are `OngoingTile`, which carry the mark control;
 * - **which tiles are in it is answered in the browser**, because marking the last
 *   released episode of a show takes that show out of *watching* and so out of this group,
 *   and the tile advances optimistically — before any read could say so.
 *
 * The head, the track, the snap and the gutters are `GroupSection`'s, shared with the
 * other four rather than copied (`home-group.tsx`).
 *
 * ── The heading goes with the last tile ──────────────────────────────────────────────
 *
 * `HomeGroup` renders nothing for an empty group — no heading, no *More*, no reserved
 * space (#138) — and a group emptied one press at a time has to reach the same answer, or
 * the surface is left with a heading over an empty track, which is reserved space that
 * looks like it works. `useMarkableEntries` asks `stillMarkable` of every entry, the same
 * rule each tile asks of itself, so the group and its tiles cannot disagree about which
 * are gone.
 *
 * **This is not the *you're caught up* state**, which is five reads coming back empty and
 * stays where `up-next-groups.tsx` decides it, on the server. `up-next-mark.ts`'s own
 * docblock says why it is not reconstructed here.
 *
 * ── The read is the server's, and this component adds none ──────────────────────────
 *
 * Every entry, its queue included, arrives as a prop from `page.tsx`'s read. Nothing here
 * fetches, and nothing here holds a copy of what has been marked — that lives in the marks
 * store, keyed by episode, which is what lets a title sheet opened from one of these tiles
 * show the same episode in the same state.
 */
export function OngoingGroup({ entries }: { entries: readonly OngoingEntry[] }) {
  const markable = useMarkableEntries(entries);

  if (markable.length === 0) return null;

  return (
    <GroupSection label="Ongoing" href="/up-next/ongoing">
      {markable.map((entry, index) => (
        <OngoingTile
          key={entry.libraryEntryId}
          entry={entry}
          className={TILE}
          /* Measured off the group as it is *rendered*, so a tile that has moved up into
             the first run after another left it is fetched eagerly like any other tile
             there. */
          aboveFold={index < FIRST_RUN}
        />
      ))}
    </GroupSection>
  );
}
