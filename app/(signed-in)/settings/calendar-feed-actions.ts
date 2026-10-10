"use server";

import { headers } from "next/headers";

import { renewCalendarFeedToken } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { calendarFeedUrl, publicOrigin } from "@/lib/calendar-feed";
import { requireUserId } from "@/lib/session";

export type RenewCalendarFeedOutcome =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reference: string | null };

/**
 * Makes this reader's calendar link, or a new one in place of the old — issue #366. The
 * same write does both: the token is replaced, so whatever URL came before answers 404.
 *
 * Caught rather than thrown for `delete-account/actions.ts`'s reason: React strips a thrown
 * action error before the browser sees it, and catching is what gets the real exception to
 * Sentry and a reference id onto the toast. It reports; it does not pretend the link changed.
 */
export async function renewCalendarFeedAction(): Promise<RenewCalendarFeedOutcome> {
  const userId = await requireUserId();

  try {
    const token = await renewCalendarFeedToken(userId);
    const origin = publicOrigin(process.env.BETTER_AUTH_URL, await headers());
    return { ok: true, url: calendarFeedUrl(origin, token) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "settings" }) };
  }
}
