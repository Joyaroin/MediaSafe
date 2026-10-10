"use client";

import { useState } from "react";

import type { ListSummary } from "@/db/access";
import { CreateListForm } from "./create-list-form";
import { EmptyLists } from "./empty-lists";
import { ListRow } from "./list-row";

/**
 * The lists — the create form and a row per list — drawn by Library's Lists tab (issue
 * #357). It was also drawn by `/lists` under its own heading until the UI overhaul made that
 * route a redirect here.
 *
 * Owns the array client-side, seeded from the server read, so a create or a delete updates
 * the screen the instant the write lands rather than waiting on a second round trip (#146).
 * Alphabetical order is kept by re-sorting after every insert: `listLists` orders by name,
 * and a `localeCompare` answers that without a round trip.
 *
 * ── There is no refresh after a landed write — issue #179 ────────────────────────────
 *
 * `createListAction` returns the row it wrote, and a delete is confirmed by an action that
 * answers `{ ok: true }` only once the row is gone, so a `router.refresh()` could only ever
 * agree with what is already on screen. The server cache (`cache/tags.ts`, the `lists` tag)
 * is busted inside each write, so the *next* render of any reader is current.
 */
export function ListsPanel({ initial }: { readonly initial: readonly ListSummary[] }) {
  const [lists, setLists] = useState<readonly ListSummary[]>(initial);

  function onCreated(created: ListSummary): void {
    setLists((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  function onDeleted(listId: string): void {
    setLists((current) => current.filter((one) => one.id !== listId));
  }

  return (
    <>
      <div className="px-gutter pt-[18px]">
        <CreateListForm onCreated={onCreated} />
      </div>

      {lists.length === 0 ? (
        <EmptyLists />
      ) : (
        <ul className="flex flex-col gap-2 px-[14px] pt-6 pb-6">
          {lists.map((list) => (
            <ListRow key={list.id} list={list} onDeleted={onDeleted} />
          ))}
        </ul>
      )}
    </>
  );
}
