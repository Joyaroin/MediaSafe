"use client";

import { AnimatePresence } from "motion/react";
import Link from "next/link";

import type { UpNextEntry } from "@/db/access";
import { sectionHref } from "@/app/(signed-in)/library/library-section";
import { ROW_LIST } from "./up-next-card-styles";
import { UpNextNotStartedRow } from "./up-next-episode-row";
import { useNotStartedOnList } from "./up-next-mark";

/**
 * Tonight's **Not started** group — issue #551 (spec: "Tonight: Not started"): up to three
 * shows in the library with no watches that have an aired episode to start from (the earliest
 * aired one, #603), under *Also ready*.
 *
 * A group of its own, not more rows of Also ready: Also ready's first five and its "See all N"
 * never count these (`tonight-list.tsx` is not handed them), and the group has no fold of its
 * own — `placeNotStarted` (`not-started.ts`) has already cut it to three. Its "See all" opens
 * Library's Not started grid (#552), which holds every Not started show, not only these three.
 *
 * Each row says where the show starts and carries the usual mark ring. A marked row closes in
 * place on `AnimatePresence`'s `popLayout`, as Also ready's rows do, and the group takes its
 * heading with its last row — an empty group is absent.
 */
export function TonightNotStarted({ entries }: { entries: readonly UpNextEntry[] }) {
  const standing = useNotStartedOnList(entries);

  if (standing.length === 0) return null;

  return (
    <section aria-labelledby="tonight-not-started-title" className="px-gutter pt-5 lg:px-0">
      <div className="-mr-3 flex min-h-11 items-center justify-between gap-3">
        <h2 id="tonight-not-started-title" className="bill-title text-bill-lg text-text">
          Not started
        </h2>
        <Link
          href={sectionHref({ kind: "show", slug: "not-started" })}
          className="flex min-h-11 items-center px-3 text-item font-medium text-text hover:text-dim"
        >
          See all
        </Link>
      </div>
      <ul className={`relative ${ROW_LIST}`}>
        <AnimatePresence initial={false} mode="popLayout">
          {standing.map((entry, index) => (
            <UpNextNotStartedRow key={entry.libraryEntryId} entry={entry} aboveFold={index < 3} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
