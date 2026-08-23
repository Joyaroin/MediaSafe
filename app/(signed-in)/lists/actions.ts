"use server";

import { cachedLists, invalidateFor } from "@/cache/tags";
import {
  addTitleToList,
  addTitlesToList,
  createList,
  createListAndAddTitle,
  deleteList,
  reorderListMembership,
  type ListSummary,
} from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The Lists destination's writes — issue #146 — plus issue #147's: reading this account's
 * lists for the *Add to list* picker, adding a title to one of them, and making a new
 * list in the same action a title is added from.
 *
 * Same shape as `search/actions.ts`: caught here rather than left to throw, because every
 * one of these can run from a control that never navigates away — the Lists page's own
 * controls, and title detail's *Add to list* dialog — so there is no route-level
 * `error.tsx` for an uncaught one to land in. `requireUserId` is the real authorization —
 * a Server Action is a POST endpoint anyone with a session can call with any arguments,
 * and `proxy.ts` only proves a cookie was present.
 *
 * ── Every write here busts `lists`, since issue #226 ────────────────────────────────
 *
 * Before that ticket these six invalidated nothing, and `INVALIDATES` said so with an
 * empty array — correctly, because nothing that read `list` or `list_membership` was
 * cached. Three surfaces read them now (the Lists destination, the phone's rail above the
 * library grid, and the picker below), all through one `lists` tag, so each write ends in
 * an `invalidateFor` and the three cannot fall out of step.
 *
 * **Past the `catch`, and past the outcomes that wrote nothing.** A failed write changed
 * nothing, and neither did a duplicate name or an add of a title the list already held —
 * busting for either would throw away a correct entry and make a write that did not happen
 * look from the cache's side like one that did. `bulk-abandon-action.ts` already reads its
 * own count this way; these read `ok` and `added`.
 */

/**
 * Distinct from `db/access.ts`'s own `CreateListOutcome` — this one, deliberately, so the
 * two are never mistaken for each other in an import: this adds the `"failed"` variant for
 * an infrastructure failure `createList` never produces on its own, since that one throws
 * rather than returning it.
 */
export type CreateListActionOutcome =
  | { readonly ok: true; readonly list: ListSummary }
  /** The name matches an existing list — not a lost write, so no reference. */
  | { readonly ok: false; readonly reason: "duplicate" }
  | { readonly ok: false; readonly reason: "failed"; readonly reference: string | null };

export async function createListAction(name: string): Promise<CreateListActionOutcome> {
  const userId = await requireUserId();
  let list: ListSummary;

  try {
    const outcome = await createList(userId, name);
    // A duplicate name wrote nothing, so there is nothing to invalidate: it leaves by its
    // own door, before the bust below.
    if (!outcome.ok) return outcome;
    list = outcome.list;
  } catch (error) {
    return { ok: false, reason: "failed", reference: referenceFor(error, { surface: "lists" }) };
  }

  invalidateFor("createList", userId);
  return { ok: true, list };
}

export type DeleteListOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function deleteListAction(listId: string): Promise<DeleteListOutcome> {
  const userId = await requireUserId();

  try {
    await deleteList(userId, listId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }

  invalidateFor("deleteList", userId);
  return { ok: true };
}

/** This account's lists, for the *Add to list* dialog to render as a picker — issue #147.
 *  A plain read, so the only failure worth naming is the request never reaching the
 *  server at all; there is no duplicate or validation case here. */
export type ListsForPickerOutcome =
  | { readonly ok: true; readonly lists: readonly ListSummary[] }
  | { readonly ok: false; readonly reference: string | null };

export async function listsForPickerAction(): Promise<ListsForPickerOutcome> {
  const userId = await requireUserId();

  try {
    return { ok: true, lists: await cachedLists(userId) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }
}

/** Whether the add landed — `added` distinguishes a fresh membership from a title that
 *  was already there, though the dialog treats both as success (issue #147: *adding it
 *  twice is not an error and not a duplicate*). */
export type AddTitleToListActionOutcome =
  | { readonly ok: true; readonly added: boolean }
  | { readonly ok: false; readonly reference: string | null };

export async function addTitleToListAction(
  listId: string,
  titleId: string,
): Promise<AddTitleToListActionOutcome> {
  const userId = await requireUserId();
  let added: boolean;

  try {
    added = (await addTitleToList(userId, listId, titleId)).added;
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }

  // `added: false` is a membership that was already there — the list says what it said
  // before, so every cached read of it is still right.
  if (added) invalidateFor("addTitleToList", userId);
  return { ok: true, added };
}

/**
 * Whether the whole bulk add landed — issue #197. `added` counts the memberships actually
 * created, which is smaller than the set whenever the list already held some of it; the
 * bar treats any `ok` as success, because *the list now says what I asked it to say* is
 * the only question the reader was asking (the same reading `addTitleToListAction`'s own
 * `added` already gets from the single-title dialog).
 *
 * There is no partial variant, and there is deliberately nowhere for one to go:
 * `addTitlesToList` is one transaction, so `ok: false` means **nothing** was written.
 */
export type AddTitlesToListActionOutcome =
  | { readonly ok: true; readonly added: number }
  | { readonly ok: false; readonly reference: string | null };

export async function addTitlesToListAction(
  listId: string,
  titleIds: readonly string[],
): Promise<AddTitlesToListActionOutcome> {
  const userId = await requireUserId();
  let added: number;

  try {
    added = (await addTitlesToList(userId, listId, titleIds)).added;
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }

  // Zero memberships created — every title in the selection was already on the list — so
  // nothing any cached read shows has changed. `addTitleToListAction`'s reason, counted.
  if (added > 0) invalidateFor("addTitlesToList", userId);
  return { ok: true, added };
}

/** Same three-way shape as `CreateListActionOutcome`, for the same reason: `"duplicate"`
 *  is the server answering plainly, not a lost write. */
export type CreateListAndAddOutcome =
  | { readonly ok: true; readonly list: ListSummary }
  | { readonly ok: false; readonly reason: "duplicate" }
  | { readonly ok: false; readonly reason: "failed"; readonly reference: string | null };

export async function createListAndAddTitleAction(
  name: string,
  titleId: string,
): Promise<CreateListAndAddOutcome> {
  const userId = await requireUserId();
  let list: ListSummary;

  try {
    const outcome = await createListAndAddTitle(userId, name, titleId);
    if (!outcome.ok) return outcome;
    list = outcome.list;
  } catch (error) {
    return { ok: false, reason: "failed", reference: referenceFor(error, { surface: "lists" }) };
  }

  invalidateFor("createListAndAddTitle", userId);
  return { ok: true, list };
}

/** Whether a drag landed — issue #149. There is no `"duplicate"` case here, unlike the
 *  three actions above: a position is never a name, and there is nothing about `1..count`
 *  a second identical drag could collide with. */
export type ReorderListOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function reorderListAction(
  listId: string,
  titleId: string,
  newPosition: number,
): Promise<ReorderListOutcome> {
  const userId = await requireUserId();

  try {
    await reorderListMembership(userId, listId, titleId, newPosition);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }

  // `getListDetail` orders by `position`, so a drag changes the rows it returns even
  // though the set of them is identical.
  invalidateFor("reorderListMembership", userId);
  return { ok: true };
}
