"use client";

import { useMemo, type ReactNode } from "react";

import {
  isEpisodeEntry,
  isPendingEntry,
  type LibraryStateGroupEntry,
  type UpNextEntry,
  type UpNextRailEntry,
} from "@/db/access";
import { TonightFeatured } from "./tonight-featured";
import { TonightList } from "./tonight-list";
import { useEntriesOnRail } from "./up-next-mark";
import { UpNextHeading } from "./up-next-heading";

/**
 * Tonight, when there is anything on it — Charcoal, issue #400 (handoff §8.1).
 *
 * ── The featured entry is the one it always was ──────────────────────────────────────
 *
 * The first Continue watching entry still standing: the read already orders Ongoing by
 * most recent watch (`listUpNextRails`), so this is a position and not a sort. Pending
 * titles are never featured, and an old friend never is either: once Ongoing is marked
 * empty, nothing is. This is `up-next-episode-rail.tsx`'s `featuredId`, moved here whole.
 *
 * ── The list is the phone's concatenation, without the featured entry ────────────────
 *
 * Pending, then Ongoing, then old friends, then films (`tonight-list.tsx`). The featured
 * entry is lifted out of it rather than drawn twice, and when it finishes it leaves the
 * store's surviving set (`useEntriesOnRail`), so the next Ongoing entry is featured and
 * leaves the list by the same rule.
 *
 * ── No featured entry ────────────────────────────────────────────────────────────────
 *
 * No artwork area at all: the screen title is a normal Screen heading and the list starts
 * under it. That is a library of old friends, pending titles and films, or one whose
 * Ongoing shows were all marked away since the page loaded.
 *
 * ── The desktop ──────────────────────────────────────────────────────────────────────
 *
 * Between `lg:` and `xl:` it is the phone's single column, the featured block a rounded
 * card at least `480px` high. From `xl:` it is two columns: the featured card on the left
 * at the column's full height, and a `380px` column holding the list and `comingUp`. The
 * list keeps one place in the tree in every layout, so a change of featured entry never
 * remounts it — a row mid-hold keeps its hold.
 */
export function TonightSurface({
  rails,
  films,
  comingUp,
}: {
  rails: {
    readonly ongoing: readonly UpNextRailEntry[];
    readonly oldFriends: readonly UpNextEntry[];
  };
  films: readonly LibraryStateGroupEntry[];
  /** The next three dated rows from Coming up, server-rendered; shown from `xl:`. */
  comingUp: ReactNode;
}) {
  const pending = useMemo(() => rails.ongoing.filter(isPendingEntry), [rails.ongoing]);

  const entries = useMemo(
    () => [...rails.ongoing.filter(isEpisodeEntry), ...rails.oldFriends],
    [rails.ongoing, rails.oldFriends],
  );

  const showing = useEntriesOnRail(entries);

  const ongoingIds = useMemo(
    () => new Set(rails.ongoing.filter(isEpisodeEntry).map((entry) => entry.libraryEntryId)),
    [rails.ongoing],
  );
  const head = showing[0];
  const featured = head !== undefined && ongoingIds.has(head.libraryEntryId) ? head : null;
  const listed = featured === null ? showing : showing.slice(1);

  return (
    <div
      className={`pb-8 lg:px-10 lg:pt-8 ${
        featured === null
          ? ""
          : "xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr] xl:gap-x-10"
      }`}
    >
      {featured === null ? (
        <div className="px-gutter pt-5 lg:px-0 lg:pt-0">
          <UpNextHeading />
        </div>
      ) : (
        <div className="xl:row-span-2">
          {/* Keyed by entry: a different show featured is a different block, with no hold
              of the last one's carried into it. */}
          <TonightFeatured key={featured.libraryEntryId} entry={featured} />
        </div>
      )}

      <TonightList
        title={featured === null ? null : "Also ready"}
        pending={pending}
        entries={listed}
        films={films}
      />

      <div className="hidden xl:block">{comingUp}</div>
    </div>
  );
}
