"use client";

import type { ListCard } from "@/db/access";
import { YouListCard } from "./you-list-card";
import { YouRail } from "./you-rail";

/**
 * You's lists rail — issue #248. A thin client composition of the generic shell and the
 * card, kept a separate module from both because `YouRail`'s `renderItem` is a function
 * prop: it has to be constructed inside a Client Component, so a Server Component
 * (`you-surface.tsx`) hands this plain data — `lists`, a JSON-serialisable array — rather
 * than a closure it could not pass across the boundary at all.
 *
 * An empty rail is `YouRail`'s own absence, not this file's: a reader with no lists at all
 * gets no heading and no reserved space, the same rule every rail in this application
 * keeps.
 */
export function YouListsRail({ lists }: { readonly lists: readonly ListCard[] }) {
  return (
    <YouRail
      label="Lists"
      entries={lists}
      keyFor={(list) => list.id}
      renderItem={(list, aboveFold) => <YouListCard list={list} aboveFold={aboveFold} />}
    />
  );
}
