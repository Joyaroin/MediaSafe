"use client";

import type { LibraryStateGroupEntry } from "@/db/access";
import { YouRail } from "./you-rail";
import { YouTitleTile } from "./you-title-tile";

/**
 * You's shows rail and films rail — issue #248. One component for both: `listYouRails`
 * (`db/access.ts`) already splits by kind, so the only thing telling the two rails apart
 * on the glass is the label passed in — `you-surface.tsx` renders this twice, `"Shows"`
 * and `"Films"`.
 *
 * `YouRail`'s own reason for being a separate module from `you-lists-rail.tsx`: its
 * `renderItem` is a closure, which has to be built inside a Client Component.
 */
export function YouTitleRail({
  label,
  entries,
}: {
  readonly label: string;
  readonly entries: readonly LibraryStateGroupEntry[];
}) {
  return (
    <YouRail
      label={label}
      entries={entries}
      keyFor={(entry) => entry.libraryEntryId}
      renderItem={(entry, aboveFold) => <YouTitleTile entry={entry} aboveFold={aboveFold} />}
    />
  );
}
