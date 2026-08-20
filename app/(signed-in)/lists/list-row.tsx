"use client";

import Link from "next/link";
import { useRef } from "react";

import type { ListSummary } from "@/db/access";
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
 * The delete control follows `abandon-control.tsx`'s own vocabulary — a dim underlined
 * text button, never the accent — because giving up on a grouping is exactly as quiet an
 * act as giving up on a show, and for the same reason: it must never compete visually
 * with the one thing the accent is reserved for.
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
        {/* Quiet, and deliberately not a pill: a destroying control that looked like the
            *New list* button above it would be the loudest thing on the screen doing the
            most irreversible thing on it. `-mr-3` and the `h-11 w-16` give it the 44px
            hit area the handoff requires without the underlined words growing a box. */}
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-label={`Delete ${list.name}`}
          className="-mr-3 flex h-11 w-16 shrink-0 items-center justify-end pr-3 text-meta text-dim underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-ink"
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
