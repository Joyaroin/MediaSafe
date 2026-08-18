"use server";

import { recordWatch, type RecordWatchParams } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The click that records a watch — issue #88, on top of `db/access.ts`'s `recordWatch`
 * (issue #85). This is a thin Server Action wrapper for the same reason
 * `search/actions.ts`'s `addToLibraryAction` is: a Server Action is a POST endpoint
 * anyone can call with any arguments, so `requireUserId` here is the check, and catching
 * here — rather than letting this throw — is what lets `errors/write-failure.ts`'s toast
 * report a reference id instead of losing the exception the moment it crosses to the
 * browser (`title-detail-actions.ts`'s docblock explains the mechanism this leans on).
 *
 * `recordWatch` itself carries the idempotency (`UNIQUE (user_id, source, source_key)`)
 * and the authorization (`ownedBy`); this wrapper adds nothing to either — it only turns
 * a throw into the outcome shape the client's rollback needs.
 */
export type WatchActionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function recordWatchAction(
  params: RecordWatchParams,
): Promise<WatchActionOutcome> {
  const userId = await requireUserId();

  try {
    await recordWatch(userId, params);
    return { ok: true };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "record-watch" }) };
  }
}
