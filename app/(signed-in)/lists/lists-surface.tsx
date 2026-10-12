"use client";

import { useState } from "react";

import type { ListOverview, ListSummary } from "@/db/access";
import { CreateListForm } from "./create-list-form";
import { EmptyLists } from "./empty-lists";
import { ListRow } from "./list-row";

/**
 * The lists — the create form and a row per list — drawn by Library's Lists tab (issue
 * #357). It was also drawn by `/lists` under its own heading until the UI overhaul made that
 * route a redirect here.
 *
 * Owns the array client-side, seeded from the server read, so a create updates the screen
 * the instant the write lands rather than waiting on a second round trip (#146). Delete is
 * no longer here: it moved to the list's own page with Charcoal (issue #402), which
 * navigates back to a fresh render of this screen.
 * Alphabetical order is kept by re-sorting after every insert: `listLists` orders by name,
 * and a `localeCompare` answers that without a round trip.
 *
 * ── There is no refresh after a landed write — issue #179 ────────────────────────────
 *
 * `createListAction` returns the row it wrote, so a `router.refresh()` could only ever
 * agree with what is already on screen. The server cache (`cache/tags.ts`, the `lists` tag)
 * is busted inside each write, so the *next* render of any reader is current.
 */
export function ListsPanel({ initial }: { readonly initial: readonly ListOverview[] }) {
  const [lists, setLists] = useState<readonly ListOverview[]>(initial);

  function onCreated(created: ListSummary): void {
    // A list made a moment ago holds nothing, so it has no posters to stack.
    setLists((current) =>
      [...current, { ...created, posters: [] }].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  return (
    <>
      <div className="px-gutter pt-3 lg:px-10">
        <CreateListForm onCreated={onCreated} />
      </div>

      {lists.length === 0 ? (
        <EmptyLists />
      ) : (
        <ul className="flex flex-col gap-2 px-gutter pt-4 pb-6 lg:px-10">
          {lists.map((list) => (
            <ListRow key={list.id} list={list} />
          ))}
        </ul>
      )}
    </>
  );
}
