"use server";

import { invalidateFor } from "@/cache/tags";
import {
  markWatchedUpTo,
  recordWatch,
  undoWatch,
  unwatch,
  type MarkWatchedUpToParams,
  type RecordWatchParams,
  type UnwatchParams,
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
 *
 * ── The three writes here bust three facts each — issues #219, then #226 ────────────
 *
 * A watch is what `library_entry_state` and `library_entry_up_next` are derived from, so
 * every one of these three changes both of the columns the library grid prints beyond the
 * poster. **Since #226 that reaches two more cached facts**, and one of them is the reason
 * that ticket exists: `up-next`, because the rails and the phone's groups are built from
 * the same two views; and `title-detail`, because the season grid marks the episode
 * watched. The call site still passes one write name — `INVALIDATES` in `cache/tags.ts` is
 * what knows how many facts that reaches.
 *
 * **This is the other half of #220's optimistic tile.** `up-next-mark.ts` advances an
 * Ongoing tile before the server answers, so the screen is right immediately; without the
 * `up-next` bust, a reload would serve the rail from before the mark and offer the reader
 * the episode they had just watched. `unwatchAction` owes the same thing to *Undo*.
 *
 * The bust runs **past the `catch`, on the success path only**: a write that did not land
 * changed nothing, and busting for it would throw away a correct entry while making a lost
 * write look from here like one that happened. The optimistic mark and its rollback
 * (`use-watch-mark.ts`) are untouched — this is what makes the server agree with the guess
 * the browser already drew, rather than a second guess of its own.
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
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "record-watch" }) };
  }

  invalidateFor("recordWatch", userId);
  return { ok: true };
}

/**
 * Unwatching an episode — issue #89, rewritten by #145, over `db/access.ts`'s `unwatch`.
 * The same thin wrapper as `recordWatchAction` above, for the same two reasons, and the
 * thinness is the point on a delete in particular: **there is no rule here.** *Every
 * watch of that episode*, *only that episode's*, *only this account's* all live in
 * `unwatch`, where `tests/watch-unwatch.test.ts` reaches them against real Postgres. A
 * guard restated here would be a second copy of a rule that has to hold at the table, and
 * a second copy is how the two come to disagree.
 *
 * ── Why nothing comes back but `ok` ───────────────────────────────────────────────────
 *
 * #89 returned two facts about what survived — still watched at all, and still an app
 * watch to take back — because the browser's optimistic guess of *unwatched* was wrong
 * whenever an imported watch or the earlier half of a rewatch was underneath, and could
 * not be worked out from here. #145 removes every watch of the episode, so **the guess is
 * now always right** and there is nothing to correct it with. A field carrying `false`
 * for ever is a field a surface eventually branches on.
 *
 * `unwatch`'s own `removed` stays off the wire, as it was. A press that removed nothing
 * is a row that was out of date, not a lost write, and the appearance it lands on —
 * unwatched — is the same either way.
 */
export type UnwatchActionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function unwatchAction(
  params: UnwatchParams,
): Promise<UnwatchActionOutcome> {
  const userId = await requireUserId();

  try {
    await unwatch(userId, params);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "unwatch" }) };
  }

  invalidateFor("unwatch", userId);
  return { ok: true };
}

/**
 * *Undo* — over `db/access.ts`'s `undoWatch`, and a fourth thin wrapper for the reasons
 * the first one gives.
 *
 * It shares `UnwatchActionOutcome` because it answers the same shape of question, and it
 * shares nothing else: this removes the newest watch and `unwatchAction` above removes
 * every one of them. `undoWatch`'s docblock has why those are two writes rather than one
 * with a flag. The surface names are kept apart too — `{ surface: "undo" }` — so a
 * reference id in a toast says which of the two failed.
 */
export async function undoWatchAction(
  params: UnwatchParams,
): Promise<UnwatchActionOutcome> {
  const userId = await requireUserId();

  try {
    await undoWatch(userId, params);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "undo" }) };
  }

  invalidateFor("unwatch", userId);
  return { ok: true };
}

/**
 * *Watched up to here* — issue #196, over `db/access.ts`'s `markWatchedUpTo`. The
 * third thin wrapper in this file, for the two reasons the first one gives: a Server
 * Action is a POST endpoint anyone can call with any arguments, so `requireUserId` here
 * is the check; and catching here is what lets the toast report a reference id rather
 * than losing the exception as it crosses to the browser.
 *
 * ── Nothing comes back but `ok`, and this is the write where that is a decision ──────
 *
 * `markWatchedUpTo` returns how many rows it wrote, and that number does not travel.
 * It is the same ruling `UnwatchOutcome`'s `removed` gets and for a sharper reason: the
 * reader has *already been shown a count* and agreed to it, in the confirmation, before
 * this was called. A second number arriving afterwards could only either agree with it —
 * saying nothing — or disagree with it, and a surface told after the fact that it wrote
 * fifty-nine of the sixty-two it promised has nowhere honest to put that. What the reader
 * needs is a screen that matches the table, and every covered row reading watched is that
 * screen whichever of them this particular press was the one to write.
 *
 * The set is **not** sent either. `MarkWatchedUpToParams` takes the episode that was
 * pressed and derives the rest server-side, so there is no list here for a tampered
 * request to widen.
 */
export type MarkWatchedUpToActionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function markWatchedUpToAction(
  params: MarkWatchedUpToParams,
): Promise<MarkWatchedUpToActionOutcome> {
  const userId = await requireUserId();

  try {
    await markWatchedUpTo(userId, params);
  } catch (error) {
    return {
      ok: false,
      reference: referenceFor(error, { surface: "mark-watched-up-to" }),
    };
  }

  invalidateFor("markWatchedUpTo", userId);
  return { ok: true };
}
