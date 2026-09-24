"use server";

import { invalidateFor } from "@/cache/tags";
import { abandonTitle, unabandonTitle, type LibraryState } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * Giving up on a title, and taking it back — issue #357. The title page's *…* menu is the
 * first caller either write has had: `abandonTitle` and `unabandonTitle` existed, the
 * Library had a filter for the state they write, and nothing in the app could reach it.
 *
 * Both answer with an outcome rather than throwing, exactly as `watch-action.ts` does: a
 * write that is lost is the caller's to announce through the write-failure toast, and the
 * reference is the one technical string that toast may carry.
 */

export type GiveUpOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export async function giveUpAction(libraryEntryId: string): Promise<GiveUpOutcome> {
  const userId = await requireUserId();

  try {
    await abandonTitle(userId, libraryEntryId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "give-up" }) };
  }

  invalidateFor("abandonTitle", userId);
  return { ok: true };
}

export type ResumeOutcome =
  | { readonly ok: true; readonly state: LibraryState }
  | { readonly ok: false; readonly reference: string | null };

/** Resuming answers with the state the entry lands in, which only the derived view knows. */
export async function resumeAction(libraryEntryId: string): Promise<ResumeOutcome> {
  const userId = await requireUserId();

  let state: LibraryState;
  try {
    ({ state } = await unabandonTitle(userId, libraryEntryId));
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "resume" }) };
  }

  invalidateFor("unabandonTitle", userId);
  return { ok: true, state };
}
