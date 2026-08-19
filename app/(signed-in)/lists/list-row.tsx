"use client";

import { useRef } from "react";

import type { ListSummary } from "@/db/access";
import { DeleteListDialog } from "./delete-list-dialog";
import { formatTitleCount } from "./title-count";

/**
 * One list, as a hairline-divided row — the same device `programme-note-episodes.tsx`
 * uses for a list of rows that are not a grid. Just the name and how many titles it holds:
 * issue #146 builds the destination and the list's own lifecycle, not what is inside one,
 * so there is nothing here to click into yet.
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
    <li className="flex items-center justify-between gap-4 border-b border-hair px-6 py-4">
      <span className="text-item text-text">{list.name}</span>

      <div className="flex items-center gap-4">
        <span className="code-line text-dim" data-numeric>
          {formatTitleCount(list.titleCount)}
        </span>

        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-label={`Delete ${list.name}`}
          className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-text"
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
