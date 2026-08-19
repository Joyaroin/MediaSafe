"use server";

import { createList, deleteList, type ListSummary } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The two writes the Lists destination makes — issue #146.
 *
 * Same shape as `search/actions.ts`: caught here rather than left to throw, because both
 * of these can run from a control that never navigates away, so there is no route-level
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
