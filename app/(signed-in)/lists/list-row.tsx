"use client";

import Link from "next/link";
import { useRef } from "react";

import type { ListSummary } from "@/db/access";
import { DeleteListDialog } from "./delete-list-dialog";
import { formatTitleCount } from "./title-count";

/**
 * One list, as a hairline-divided row — the same device `programme-note-episodes.tsx`
 * uses for a list of rows that are not a grid.
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
    <li className="flex items-center justify-between gap-4 border-b border-hair px-6 py-4">
      <Link
        href={`/lists/${list.id}`}
        className="flex min-w-0 flex-1 items-center gap-4 hover:text-dim"
      >
        <span className="text-item text-text">{list.name}</span>
        <span className="code-line text-dim" data-numeric>
          {formatTitleCount(list.titleCount)}
        </span>
      </Link>

      <div className="flex items-center gap-4">
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
