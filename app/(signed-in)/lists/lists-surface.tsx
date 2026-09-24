"use client";

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
 * a second round trip.
 *
 * Alphabetical order is kept by re-sorting after every insert rather than by re-fetching:
 * `listLists` orders by name, and a client array can keep that property itself without a
 * server round trip for something a `localeCompare` already answers.
 *
 * ── There is no refresh after a landed write — issue #179 ────────────────────────────
 *
 * Both handlers below used to end in `router.refresh()`, which re-ran `listLists`,
 * `requireUserId` and every other read on this route to confirm something the two lines
 * above it had already put on screen. Neither needed it: `createListAction` returns the
 * row it wrote, and a delete is named by the id the caller passed in and confirmed by an
 * action that answers `{ ok: true }` only once the row is gone. Both answers arrive with
 * the write, so a second full render of the page could only ever agree with them.
 *
 * The two reasons the old docblock gave for keeping it were both checked and neither
 * holds. **No nav cell reads the lists** — `sidebar-nav.tsx` and `tab-bar.tsx` are links
 * and nothing else. And **there is no client-side page cache to keep in step**:
 * `page.tsx` is `force-dynamic`, and Next.js has not reused a dynamic page segment from
 * the client Router Cache on a `Link` or `useRouter` navigation since 15
 * (`staleTimes.dynamic` defaults to `0`).
 *
 * **There is a server cache now, and it changes nothing here.** Issue #226 put the lists
 * behind `cache/tags.ts` under the `lists` tag, and #223 added a third reader — the phone's
 * Lists rail above the library grid — beside this page and the *Add to list* picker. All
 * three read one entry, and every write in `lists/actions.ts` busts it inside its own
 * action, so the entry cannot outlive the write that invalidates it. The optimistic update
 * below is still what puts the row on screen; the bust is what the *next* render of any of
 * the three surfaces reads.
 *
 * What that change did leave reusable is **browser history**: press Back onto this route
 * and the payload from before the write is what restores, so a list made and then
 * navigated away from is briefly absent until the route is entered forwards again. That is
 * a real difference and it is the one this ticket accepts on purpose — a restored history
 * entry showing the page as it was is what the Back button means everywhere else, and
 * buying it back would cost a full page render on every create and delete for readers who
 * never press it.
 *
 * `remove/actions.ts` decides the same question the other way in this same commit, and the
 * two are not in tension: what a stale restore shows here is a list briefly missing until
 * the route is entered forwards, and what it would show there is a title the reader was
 * told had been destroyed. A create is cheap to be late about; a destruction is not.
 */
export function ListsSurface({ initial }: { readonly initial: readonly ListSummary[] }) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <ListsHeading />
      <ListsPanel initial={initial} />
    </main>
  );
}

/**
 * The lists themselves — the create form and a row per list — without a page around them,
 * so Library's Lists tab (issue #357) and this route draw the same thing.
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
      <div className="px-[22px] pt-[18px]">
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
