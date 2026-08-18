"use server";

import { listUpNext, type UpNextCursor, type UpNextPage } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The one write past the first page — a Server Action rather than a page render, for the
 * same reason `app/(signed-in)/library/[entryId]/title-detail-actions.ts` gives: this is
 * called from `UpNextSurface`, which never navigates on a failure here, so it has no
 * route boundary to throw into. Catching here is what lets Sentry see the real exception
 * and `UpNextSurface` show something rather than an unhandled rejection.
 *
 * `requireUserId` is the check — a Server Action is a POST endpoint anyone can call with
 * any arguments, and `cursor` is opaque to the caller but not to whoever is holding it, so
 * the account scope still has to come from the session rather than from the cursor.
 */
export type UpNextPageOutcome =
  | { readonly ok: true; readonly value: UpNextPage }
  | { readonly ok: false; readonly reference: string | null };

export async function upNextPageAction(
  cursor: UpNextCursor,
): Promise<UpNextPageOutcome> {
  const userId = await requireUserId();

  try {
    return { ok: true, value: await listUpNext(userId, cursor) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "up-next-page" }) };
  }
}
