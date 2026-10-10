"use client";

import { AnimatePresence } from "motion/react";
import { useMemo } from "react";

import {
  isEpisodeEntry,
  isPendingEntry,
  type UpNextEntry,
  type UpNextRailEntry,
} from "@/db/access";
import { UpNextGroup } from "./up-next-group";
import { UpNextEpisodeRow, UpNextPendingRow } from "./up-next-episode-row";
import { useEntriesOnRail } from "./up-next-mark";

/**
 * The phone's next-episodes group — one list over both halves of Continue watching, which
 * is #250's own shape and is unchanged by the move from a rail to a list. A show whose Up
 * next episode has not aired is not on it (`CONTINUE_WATCHING`); it is on Coming up.
 *
 * The name is kept as `UpNextEpisodeRail` while its callers and tests are: what it renders
 * is `UpNextGroup`'s vertical list, and `up-next-group.tsx` holds the argument for that.
 *
 * The press is `"episode"` — the phone navigates to the episode the row is naming, which
 * is #274's rule and divergence 3's phone half.
 */
export function UpNextEpisodeRail({
  rails,
}: {
  rails: {
    readonly ongoing: readonly UpNextRailEntry[];
    readonly oldFriends: readonly UpNextEntry[];
  };
}) {
  const pending = useMemo(() => rails.ongoing.filter(isPendingEntry), [rails.ongoing]);

  const entries = useMemo(
    () => [
      ...rails.ongoing.filter(isEpisodeEntry),
      ...rails.oldFriends,
    ],
    [rails.ongoing, rails.oldFriends],
  );

  const showing = useEntriesOnRail(entries);

  /**
   * The featured card — issue #362: the first ongoing entry still on the rail. The read
   * already orders Ongoing by most recent watch (`listUpNextRails`), so this is a position
   * and not a sort. Pending titles are a separate list and never featured, and an old
   * friend never is either: once Ongoing is marked empty, nothing is featured.
   */
  const ongoingIds = useMemo(
    () => new Set(rails.ongoing.filter(isEpisodeEntry).map((entry) => entry.libraryEntryId)),
    [rails.ongoing],
  );
  const head = showing[0];
  const featuredId =
    head !== undefined && ongoingIds.has(head.libraryEntryId) ? head.libraryEntryId : null;

  /* A group of nothing but pending rows is still a group — the reader has just added their
     first title, and the tab it was added for must not read as empty. */
  if (pending.length === 0 && showing.length === 0) return null;

  return (
    <UpNextGroup label="Continue watching" hideLabel>
      {pending.map((entry, index) => (
        <UpNextPendingRow
          key={entry.libraryEntryId}
          entry={entry}
          aboveFold={index < FIRST_RUN}
        />
      ))}
      {/* `initial={false}`: cards on the first paint arrive with the grid's own stagger,
          not a second entrance. What this is for is the leaving — a card whose last aired
          episode was just marked fades out after its hold, and `layout` closes the gap. */}
      <AnimatePresence initial={false}>
        {showing.map((entry, index) => (
          <UpNextEpisodeRow
            key={entry.libraryEntryId}
            entry={entry}
            aboveFold={pending.length + index < FIRST_RUN}
            featured={entry.libraryEntryId === featuredId}
          />
        ))}
      </AnimatePresence>
    </UpNextGroup>
  );
}

/** Cards asked for eagerly — about a phone screen's worth at the card's `56px` poster. */
const FIRST_RUN = 6;
