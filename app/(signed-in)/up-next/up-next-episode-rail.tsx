"use client";

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

  /* A group of nothing but pending rows is still a group — the reader has just added their
     first title, and the tab it was added for must not read as empty. */
  if (pending.length === 0 && showing.length === 0) return null;

  return (
    <UpNextGroup label="Continue watching">
      {pending.map((entry, index) => (
        <UpNextPendingRow
          key={entry.libraryEntryId}
          entry={entry}
          aboveFold={index < FIRST_RUN}
        />
      ))}
      {showing.map((entry, index) => (
        <UpNextEpisodeRow
          key={entry.libraryEntryId}
          entry={entry}
          aboveFold={pending.length + index < FIRST_RUN}
        />
      ))}
    </UpNextGroup>
  );
}

/** Rows asked for eagerly. Three, not the track's two: a vertical list puts more of itself
 *  above the fold than a horizontal one did. */
const FIRST_RUN = 3;
