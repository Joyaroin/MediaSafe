"use server";

import { markImportOfferAnswered } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";

/**
 * The one write the **Bring your library in** screen makes (issue #75): recording that
 * the offer was answered, regardless of which of the two buttons was pressed.
 *
 * `WelcomeSurface` decides where to go next — `/import` or `/library` — after this
 * resolves; there is nothing here for that decision to change, so it takes no argument
 * naming the choice. A chunk of the import route itself, `applyImportChunkAction`, is
 * what actually moves titles once the reader is on `/import`.
 */
export type AnswerImportOfferOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

/**
 * Caught here rather than left to throw, for the same reason `search/actions.ts` catches:
 * React strips a thrown Server Action error before it reaches the browser, so catching is
 * what gets the real exception to Sentry and a reference id — rather than a generic
 * message and a `digest` — onto this screen's own inline failure treatment.
 */
export async function answerImportOfferAction(): Promise<AnswerImportOfferOutcome> {
  const userId = await requireUserId();

  try {
    await markImportOfferAnswered(userId);
    return { ok: true };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "welcome" }) };
  }
}
