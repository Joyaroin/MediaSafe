"use server";

import {
  addTitleToList,
  createList,
  createListAndAddTitle,
  deleteList,
  listLists,
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

  try {
    const outcome = await createList(userId, name);
    if (!outcome.ok) return outcome;
    return { ok: true, list: outcome.list };
  } catch (error) {
    return { ok: false, reason: "failed", reference: referenceFor(error, { surface: "lists" }) };
  }
}

export type DeleteListOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function deleteListAction(listId: string): Promise<DeleteListOutcome> {
  const userId = await requireUserId();

  try {
    await deleteList(userId, listId);
    return { ok: true };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }
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
    return { ok: true, lists: await listLists(userId) };
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

  try {
    const outcome = await addTitleToList(userId, listId, titleId);
    return { ok: true, added: outcome.added };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }
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

  try {
    const outcome = await createListAndAddTitle(userId, name, titleId);
    if (!outcome.ok) return outcome;
    return { ok: true, list: outcome.list };
  } catch (error) {
    return { ok: false, reason: "failed", reference: referenceFor(error, { surface: "lists" }) };
  }
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
    return { ok: true };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }
}
