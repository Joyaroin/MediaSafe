"use client";

import type { UpNextEntry } from "@/db/access";
import { RailSection, FIRST_RUN } from "./up-next-phone-rail";
import { UpNextEpisodeCard } from "./up-next-episode-card";
import { useEntriesOnRail } from "./up-next-mark";

/**
 * The landing screen's first rail — issue #250, and the thing the app is opened to look
 * at.
 *
 * ── The order is three rules concatenated, and that is the whole of this file ────────
 *
 * `db/access.ts`'s `listUpNextRails` answers three memberships in `SPEC.md` §7's one
 * order, and the caller hands them here already separated. This rail is
 * **ongoing, then coming back, then old friends**, in that sequence, and the sequence is
 * the rule the five deleted vertical groups used to express structurally.
 *
 * **Get it wrong and nothing throws.** The rail still renders, still holds episodes, and
 * quietly leaves the cold shows out — `oldFriends` is *watching, everything not in
 * ongoing*, which on the committed library is 187 of the 199 watching titles. A rail built
 * from `ongoing` alone would look completely correct to anybody who was not counting.
 * `tests/up-next-phone-rails.test.ts` is what holds the sequence.
 *
 * Concatenated here rather than in the read for the reason `UpNextRails` states: the
 * desktop still draws the same three as three, so flattening them server-side would put
 * the ordering somewhere no surface could see and the desktop could not undo.
 *
 * ── A client component, and only because of the mark ─────────────────────────────────
 *
 * `up-next-phone-rail.tsx`'s `RailSection` is a server component and stays one; what needs
 * a boundary is `useEntriesOnRail`, which subscribes to the marks store so that a rail
 * whose last card has been marked away takes its heading with it rather than standing over
 * an empty track. The films rail beside this one needs none of that and has none.
 */
export function UpNextEpisodeRail({
  rails,
}: {
  rails: {
    readonly ongoing: readonly UpNextEntry[];
    readonly comingBack: readonly UpNextEntry[];
    readonly oldFriends: readonly UpNextEntry[];
  };
}) {
  /**
   * The one line that makes the three orderings one rail. Written out rather than
   * `Object.values(rails)` so the sequence is a fact of this file and not of a key order.
   */
  const entries = [...rails.ongoing, ...rails.comingBack, ...rails.oldFriends];

  /**
   * The survivors, after any marks made since the page loaded. `stillOnRail` is the rule
   * (`up-next-mark.ts`) and it is asked once per entry here and once per card there, so
   * the rail and its cards cannot disagree about which cards are gone.
   */
  const showing = useEntriesOnRail(entries);

  if (showing.length === 0) return null;

  return (
    <RailSection label="Next episodes">
      {showing.map((entry, index) => (
        <UpNextEpisodeCard
          key={entry.libraryEntryId}
          entry={entry}
          aboveFold={index < FIRST_RUN}
        />
      ))}
    </RailSection>
  );
}
