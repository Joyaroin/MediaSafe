"use client";

import Link from "next/link";
import { useState } from "react";

import { groupDayByTitle, type HeatmapWatch } from "./heatmap";

/**
 * A selected day's watches, one collapsed row per title — issue #539. The grouping is
 * `groupDayByTitle` (pure, `tests/heatmap.test.ts`); this holds only what is open.
 *
 * Five titles show, then "Show all N titles". The year grid keys this by day, so picking
 * another day starts closed again.
 */

export const TITLES_SHOWN = 5;

export function DayWatches({ watches }: { readonly watches: readonly HeatmapWatch[] }) {
  const groups = groupDayByTitle(watches);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const shown = showAll ? groups : groups.slice(0, TITLES_SHOWN);

  function toggle(id: string) {
    setOpen((held) => {
      const next = new Set(held);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <>
      <ul className="mt-2 grid grid-cols-1 gap-1 lg:grid-cols-2 lg:items-start">
        {shown.map((group) => {
          const isOpen = open.has(group.libraryEntryId);
          const panel = `day-title-${group.libraryEntryId}`;
          return (
            <li key={group.libraryEntryId} className="min-w-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => toggle(group.libraryEntryId)}
                className="flex w-full min-w-0 items-baseline py-1 text-left text-item"
              >
                {/* Only the title gives way on a narrow screen; the facts after it stay whole.
                    `whitespace-pre` keeps the " · " that opens `detail`, which a flex item
                    would otherwise strip. */}
                <span className="min-w-0 truncate text-text">{group.lead}</span>
                <span className="shrink-0 whitespace-pre text-meta text-dim">{group.detail}</span>
              </button>
              {isOpen ? (
                <div id={panel} className="pb-2 pl-3">
                  <ul className="grid gap-0.5">
                    {group.episodes.map((episode) => (
                      <li key={episode.key} className="text-meta text-dim">
                        {episode.what}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/titles/${group.libraryEntryId}`}
                    className="mt-1 inline-block py-1 text-meta text-text"
                  >
                    Open {group.titleName}
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {showAll || groups.length <= TITLES_SHOWN ? null : (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 py-1 text-meta text-text"
        >
          Show all {groups.length.toLocaleString("en-GB")} titles
        </button>
      )}
    </>
  );
}
