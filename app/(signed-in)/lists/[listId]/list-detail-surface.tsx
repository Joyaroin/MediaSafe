"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ICON_BUTTON, MENU_ITEM } from "@/app/buttons";
import type { ListDetailRow, ListDetailTitleRow } from "@/db/access";
import { BackToListsBar } from "../back-to-lists-bar";
import { DeleteListDialog } from "../delete-list-dialog";
import { EmptyListDetail } from "./empty-list-detail";
import { ListDetailBody } from "./list-detail-body";
import { ListNameHeading } from "./list-name-heading";

/**
 * A list's own page, below the route — Charcoal, handoff §8.5 and issue #402: the round
 * back button and the three-dot menu, the name at Screen size, then the titles.
 *
 * ── Why the name and the order live here ─────────────────────────────────────────────
 *
 * Three things on this page read them and none is the other's parent. The menu starts a
 * rename that the heading carries out; the delete dialog says how many titles the list
 * holds *now*, after any taken off; and take-off's toast names the list, which should be
 * its name after a rename rather than the one the page loaded with.
 *
 * ── Delete lives behind the menu ─────────────────────────────────────────────────────
 *
 * It used to be a button on every row of Lists. It asks first, as it always did, and a
 * landed delete takes the reader back to Lists — the page they are on no longer exists.
 * The server cache was busted inside the action, so Lists renders without it.
 */
export function ListDetailSurface({ detail }: { readonly detail: ListDetailRow }) {
  const router = useRouter();
  const [name, setName] = useState(detail.name);
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<readonly ListDetailTitleRow[]>(detail.titles);
  const deleteRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <BackToListsBar
        trailing={
          <ListMenu
            listName={name}
            onRename={() => setEditing(true)}
            onDelete={() => deleteRef.current?.showModal()}
          />
        }
      />

      <div className="px-gutter pt-3 lg:px-10">
        {/* Keyed on `editing`, so each rename starts from the name as it stands. */}
        <ListNameHeading
          key={editing ? "editing" : "reading"}
          listId={detail.id}
          name={name}
          onNameChange={setName}
          editing={editing}
          onEditingChange={setEditing}
        />
      </div>

      {/* Empty by the server's read, not by `order`: a list whose last title is taken off
          keeps its body mounted, because take-off's Undo lives in it. */}
      {detail.titles.length === 0 ? (
        <EmptyListDetail />
      ) : (
        <ListDetailBody listId={detail.id} listName={name} order={order} setOrder={setOrder} />
      )}

      <DeleteListDialog
        ref={deleteRef}
        listId={detail.id}
        listName={name}
        titleCount={order.length}
        onDeleted={() => router.push("/library?view=lists")}
      />
    </>
  );
}

/**
 * Rename and Delete list, behind *…* — a native `<details>`, as the title page's own menu
 * is (`library/title-actions.tsx`): keyboard-operable and announced as a disclosure with
 * no script of its own. `raised` with `44px` rows (handoff §8). Each item closes the menu
 * before it acts, so the menu is not left open behind the dialog or the rename field.
 */
function ListMenu({
  listName,
  onRename,
  onDelete,
}: {
  readonly listName: string;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function choose(action: () => void): void {
    detailsRef.current?.removeAttribute("open");
    action();
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label={`More for ${listName}`}
        className={`${ICON_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
          <circle cx="5.5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="18.5" cy="12" r="1.8" />
        </svg>
      </summary>

      <div className="absolute right-0 z-20 mt-2 flex w-52 flex-col rounded-[var(--radius-4)] bg-raised plate-line p-1.5">
        <button type="button" onClick={() => choose(onRename)} className={`${MENU_ITEM} text-text`}>
          Rename
        </button>
        <button type="button" onClick={() => choose(onDelete)} className={`${MENU_ITEM} font-medium text-danger`}>
          Delete list
        </button>
      </div>
    </details>
  );
}
