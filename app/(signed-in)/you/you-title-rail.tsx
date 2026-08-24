"use client";

import type { LibraryStateGroupEntry } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";
import { YouRail } from "./you-rail";
import { YouTitleTile } from "./you-title-tile";

/**
 * You's shows rail and films rail — issue #248. One component for both: `listYouRails`
 * (`db/access.ts`) already splits by kind, so the only things telling the two rails apart
 * on the glass are the label and `kind` passed in — `you-surface.tsx` renders this twice,
 * `"Shows"`/`"show"` and `"Films"`/`"film"`. `kind` goes no further than `YouTitleTile`'s
 * meta line: `listYouRails` already spent the column routing an entry onto one rail or the
 * other, so `LibraryStateGroupEntry` itself does not carry it.
 *
 * `YouRail`'s own reason for being a separate module from `you-lists-rail.tsx`: its
 * `renderItem` is a closure, which has to be built inside a Client Component.
 */
export function YouTitleRail({
  label,
  kind,
  entries,
}: {
  readonly label: string;
  readonly kind: TitleKind;
  readonly entries: readonly LibraryStateGroupEntry[];
}) {
  return (
    <YouRail
      label={label}
      entries={entries}
      keyFor={(entry) => entry.libraryEntryId}
      renderItem={(entry, aboveFold) => (
        <YouTitleTile entry={entry} kind={kind} aboveFold={aboveFold} />
      )}
    />
  );
}
