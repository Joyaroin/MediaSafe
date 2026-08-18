"use server";

import { listUpNext, type UpNextPage } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The desktop TONIGHT row's read — issue #100, over `db/access.ts`'s `listUpNext`
 * (issue #98). A thin Server Action wrapper for the same reason
 * `title-detail-actions.ts` gives: the row never navigates, so there is no route-level
 * `error.tsx` for it to throw into, and catching here is what turns a lost exception into
 * a reference id the reader can see (`AGENTS.md`'s error discipline).
 *
 * Always the first page, cursor `null`: the row is bounded by the viewport, not by
 * paging, so nothing here ever asks `listUpNext` for a second one.
 */
export type UpNextOutcome =
  | { readonly ok: true; readonly value: UpNextPage }
  | { readonly ok: false; readonly reference: string | null };

export async function listUpNextAction(): Promise<UpNextOutcome> {
  const userId = await requireUserId();

  try {
    return { ok: true, value: await listUpNext(userId) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "up-next" }) };
  }
}
