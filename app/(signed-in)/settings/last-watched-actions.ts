"use server";

import { headers } from "next/headers";

import {
  renewLastWatchedToken,
  switchOffLastWatchedSharing,
  switchOnLastWatchedSharing,
} from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { publicOrigin } from "@/lib/calendar-feed";
import { lastWatchedUrl } from "@/lib/last-watched";
import { requireUserId } from "@/lib/session";

export type LastWatchedLinkOutcome =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reference: string | null };

export type LastWatchedOffOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

/**
 * The three writes behind Settings' *share my last watched title* row — issue #530. Each
 * calls `requireUserId()` first, then catches a failed write and returns it with a
 * reference rather than throwing, for `renewCalendarFeedAction`'s reason: React strips a
 * thrown action error before the browser sees it, and catching is what gets the real
 * exception to Sentry and a reference id onto the toast. None of them reports a write as
 * done that was not.
 */

/** Switches sharing on. The first time it makes the link; after that it is the same one. */
export async function switchOnLastWatchedAction(): Promise<LastWatchedLinkOutcome> {
  const userId = await requireUserId();

  try {
    const token = await switchOnLastWatchedSharing(userId);
    const origin = publicOrigin(process.env.BETTER_AUTH_URL, await headers());
    return { ok: true, url: lastWatchedUrl(origin, token) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "settings" }) };
  }
}

/** Switches sharing off. The link stops answering at once and is kept for next time. */
export async function switchOffLastWatchedAction(): Promise<LastWatchedOffOutcome> {
  const userId = await requireUserId();

  try {
    await switchOffLastWatchedSharing(userId);
    return { ok: true };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "settings" }) };
  }
}

/** Replaces the link. The old one never answers again. */
export async function renewLastWatchedAction(): Promise<LastWatchedLinkOutcome> {
  const userId = await requireUserId();

  try {
    const token = await renewLastWatchedToken(userId);
    const origin = publicOrigin(process.env.BETTER_AUTH_URL, await headers());
    return { ok: true, url: lastWatchedUrl(origin, token) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "settings" }) };
  }
}
