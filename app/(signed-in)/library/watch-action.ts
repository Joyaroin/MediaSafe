"use server";

import {
  recordWatch,
  undoWatch,
  type RecordWatchParams,
  type UndoWatchParams,
} from "@/db/access";
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

/**
 * Taking one watch back — issue #89, over `db/access.ts`'s `undoWatch`. The same thin
 * wrapper as `recordWatchAction` above, for the same two reasons, and it is worth saying
 * that the thinness is the point on a delete in particular: **there is no rule here.**
 * *Never an imported watch*, *exactly one row*, *the most recent one this account
 * recorded* — all three live in `undoWatch`, where `tests/watch-undo.test.ts` reaches
 * them against real Postgres. A guard restated here would be a second copy of a rule that
 * has to hold at the table, and a second copy is how the two come to disagree.
 *
 * ── What comes back, and why it is not a boolean ──────────────────────────────────────
 *
 * Two facts about what survives, both read from the table rather than assumed: whether
 * the episode is still watched at all, and whether there is still an app watch to undo.
 * A browser cannot work either out — an imported watch underneath is invisible to it, and
 * so is the earlier half of a rewatch — so its optimistic guess of *unwatched* is
 * corrected from these rather than left standing.
 *
 * `undoWatch`'s own `removed` is deliberately **not** on the wire. Nothing renders it: a
 * press that removed nothing because there was nothing of this account's to remove is not
 * a lost write, it is the row having been out of date, and the two fields above are what
 * put it right. Adding a third field no surface reads is how a surface eventually invents
 * a use for it.
 */
export type UndoActionOutcome =
  | { readonly ok: true; readonly watched: boolean; readonly undoable: boolean }
  | { readonly ok: false; readonly reference: string | null };

export async function undoWatchAction(
  params: UndoWatchParams,
): Promise<UndoActionOutcome> {
  const userId = await requireUserId();

  try {
    const outcome = await undoWatch(userId, params);
    return { ok: true, watched: outcome.watched, undoable: outcome.undoable };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "undo-watch" }) };
  }
}
