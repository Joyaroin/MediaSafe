"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ListSummary } from "@/db/access";
import { CreateListForm } from "./create-list-form";
import { EmptyLists } from "./empty-lists";
import { ListRow } from "./list-row";
import { ListsHeading } from "./lists-heading";

/**
 * The populated Lists screen — issue #146.
 *
 * Owns the array client-side, seeded from the server read `page.tsx` already did, so a
 * create or a delete updates the screen the instant the write lands rather than waiting on
 * a second round trip. `router.refresh()` after each landed write is still called, the
 * same pattern `display-name-control.tsx` and `delete-account-form.tsx` use: it keeps the
 * server's own cache of this page in step, so a later navigation back here — or the phone
 * tab and the desktop nav cell, which read the identical `listLists` query — never serves
 * a stale count for a list touched on this screen.
 *
 * Alphabetical order is kept by re-sorting after every insert rather than by re-fetching:
 * `listLists` orders by name, and a client array can keep that property itself without a
 * server round trip for something a `localeCompare` already answers.
 */
export function ListsSurface({ initial }: { readonly initial: readonly ListSummary[] }) {
  const router = useRouter();
  const [lists, setLists] = useState<readonly ListSummary[]>(initial);

  function onCreated(created: ListSummary): void {
    setLists((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
    router.refresh();
  }

  function onDeleted(listId: string): void {
    setLists((current) => current.filter((one) => one.id !== listId));
    router.refresh();
  }

  return (
    <main className="flex w-full flex-1 flex-col">
      <ListsHeading />

      <div className="px-6 py-6">
        <CreateListForm onCreated={onCreated} />
      </div>

      {lists.length === 0 ? (
        <EmptyLists />
      ) : (
        <ul>
          {lists.map((list) => (
            <ListRow key={list.id} list={list} onDeleted={onDeleted} />
          ))}
        </ul>
      )}
    </main>
  );
}
