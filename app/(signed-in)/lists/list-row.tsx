"use client";

import Link from "next/link";
import { useRef } from "react";

import type { ListSummary } from "@/db/access";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { DeleteListDialog } from "./delete-list-dialog";
import { formatTitleCount } from "./title-count";

/**
 * One list, as a `--raised` card — a `16px` radius on a `64px` minimum height, with an
 * `8px` gap to the next (`lists-surface.tsx`). It was a hairline-divided row until the
 * linen redesign, the same device `programme-note-episodes.tsx` still uses; turn 9 makes
 * it a card for the reason `library-grid.tsx` sets out at length — `--raised` sits below
 * the ground in this palette, so a card is a well in the sheet and needs no line to be
 * one.
 *
 * ── The count moved to its own line ──────────────────────────────────────────────────
 *
 * It used to sit beside the name on the same baseline. Turn 9 puts it under, which is
 * what lets the name have the row's width before it truncates: a list called *Films to
 * watch with Mum at Christmas* and a count of *14 titles* were previously competing for
 * one line, and the name lost. `formatTitleCount` is untouched — where the string is
 * drawn changed, not what it says.
 *
 * ── The name and count are the link, the delete control is not ────────────────────────
 *
 * Issue #146 built this row with *"nothing here to click into yet"*; issue #147 is that
 * destination — `lists/[listId]`, the ordered rows a list actually holds. The `Link` wraps
 * only the name and the count rather than the whole `<li>`, because HTML forbids nesting a
 * `<button>` (the delete control) inside an `<a>`, and the two are not the same gesture
 * anyway: one opens the list, the other destroys it.
 *
 * Issue #195 moved the delete control off `abandon-control.tsx`'s old vocabulary — a dim
 * underlined text button, never the accent — onto `GHOST_RECOVERY`, the register the whole
 * underline conversion reuses knowingly. It no longer avoids the accent; nothing here reads
 * as louder than the recording control for it, because `GHOST_RECOVERY` is an outline until
 * pressed, not a fill.
 */
export function ListRow({
  list,
  onDeleted,
}: {
  readonly list: ListSummary;
  readonly onDeleted: (listId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <li className="flex min-h-16 items-center justify-between gap-3.5 rounded-2xl bg-raised px-4 py-3">
      <Link href={`/lists/${list.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-card font-medium leading-[1.25] tracking-[-0.01em] text-ink">
          {list.name}
        </span>
        <span className="mt-0.5 block text-meta leading-[1.3] text-dim" data-numeric>
          {formatTitleCount(list.titleCount)}
        </span>
      </Link>

      <div className="flex items-center">
        {/* Issue #195: now a pill, on the same GHOST_RECOVERY register every other control
            in this batch takes. `h-11` keeps the 44px tap target the old hit-area hack
            gave it; the box itself is the target now, so the hack is gone with it. */}
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-label={`Delete ${list.name}`}
          className={`flex h-11 shrink-0 items-center ${GHOST_RECOVERY}`}
        >
          Delete
        </button>

        <DeleteListDialog
          ref={dialogRef}
          listId={list.id}
          listName={list.name}
          titleCount={list.titleCount}
          onDeleted={onDeleted}
        />
      </div>
    </li>
  );
}
